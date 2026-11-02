# task_03 — Open registratie met e-mailverificatie

> Plan. **Taak 2–6 zijn uitgevoerd**; taak 1 is **klaargezet** (SQL + checklist) en moet
> nog in het Supabase Dashboard worden uitgevoerd (zie `supabase-verification.sql`).
> Elke taak hieronder is één regel `[ ]` en wordt pas op `[x]`
> gezet nadat deze is geïmplementeerd **en** aantoonbaar getest (zie AGENTS.md §12).
> Dit bestand is de **opvolger** van `task_02.md`; `task_02.md` blijft onaangetast.
> Voortgang wordt bijgehouden in `tasks.md` (één verwijzingsregel) en in dit bestand.

> **Deze ronde vervangt het uitnodigingsmodel.** De uitnodigingsregistratie uit `task_02.md`
> (fase A) wordt **volledig verwijderd**: geen token, geen `invites`/`invite_claims`,
> geen DB-trigger. In de plaats komt **open registratie met e-mailverificatie** via Supabase.

## 0. Context & werkwijze

- Project: Vue 3 + TypeScript (strict) + Vite + Supabase + Capacitor. Zie `AGENTS.md`.
- **Web-first**: bouwen en testen met `npm run dev` + `npm run build`.
  De Android-export (APK) is **gated** en gebeurt **pas na expliciete goedkeuring**.
- Per taak: klein, testbaar, één ding tegelijk. Na elke taak `npm run typecheck`,
  `npm run test`, `npm run build`, `npm run format` en handmatig testen in de browser.
- Nieuwe/gewijzigde logica wordt **getest met vitest**.
- Geen eigen SMTP-provider (bewust besluit, zie hieronder). Gevolg: de
  bevestigings- én herstelmail gaan via de standaardaflevering van Supabase
  (enkele mails per uur, kans op spam). Dat is een expliciet geaccepteerde beperking.

### Overzicht van de te leveren onderdelen

| #   | Onderdeel                            | Resultaat                                                                  |
| --- | ------------------------------------ | -------------------------------------------------------------------------- |
| 1   | Supabase: invite eruit               | Trigger + tabellen + RPC verwijderd; open signup werkt                     |
| 1b  | Supabase: verificatie aan            | `Confirm email` AAN + template gestyled + RLS-grendel                      |
| 2   | Auth-laag                            | `register` / `resendVerification` / `verificationEmail` / `justVerified`   |
| 3   | Registreren-knop + verificatiepagina | Inlogpagina → registratie → verificatiepagina                              |
| 4   | Deep link                            | Bevestigings-callback (auto-login + groene banner); recovery/signup-bugfix |
| 5   | Verwijder-dialog                     | Route B: eigen knopstijl, kleinere tekst + gelijke hoogte                  |
| 6   | Tests                                | Spec-files bijgewerkt/uitgebreid                                           |
| 7   | AGENTS.md                            | §7.6/§8.9/§8.11/§13/§4 bijwerken                                           |
| 8   | Android-build                        | **Alleen na goedkeuring**                                                  |

---

## Taak 1 — Supabase: uitnodigingssysteem verwijderen + verificatie aanzetten

> Kan **niet** vanuit de repo: uitvoeren in het Supabase Dashboard en de SQL Editor.
> Zonder 1.1 blijft élke open registratie server-side falen met `no_active_invite`.

- [x] **1.1** Nieuw SQL-script (bijv. `supabase-verification.sql`, idempotent) dat het
      uitnodigingsmodel volledig opruimt:

      ```sql
      drop trigger if exists on_auth_user_created_invite on auth.users;
      drop function if exists public.enforce_invite_on_signup();
      drop function if exists public.claim_invite(text);
      drop table if exists public.invite_claims;
      drop table if exists public.invites;
      ```

- [x] **1.2** In het script ook de **back-end grendel** opnemen (defense in depth):

      ```sql
      create or replace function public.is_email_confirmed()
      returns boolean language sql stable security definer
      set search_path = public, auth as $$
        select coalesce(
          (select u.email_confirmed_at is not null
             from auth.users u where u.id = auth.uid()), false);
      $$;
      grant execute on function public.is_email_confirmed() to authenticated;
      ```

      Daarna `and public.is_email_confirmed()` toevoegen aan álle `lists_*`- en
      `items_*`-policies in `supabase-schema.sql`. Een ongeverifieerde gebruiker kan
      daarmee niets lezen/schrijven, ook al zou er ooit een sessie bestaan.

- [ ] **1.3** Supabase-instelling: **"Confirm email" AANzetten** (Authentication → Providers →
      Email). Gevolg: `signUp` geeft geen sessie terug tot de gebruiker klikt; inloggen zonder
      bevestiging wordt server-side geweigerd. `Allow new users to sign up` blijft AAN.

- [ ] **1.4** URL-configuratie: Site URL en Redirect URLs blijven `com.lijstjes.app://`.
      Voor webtesten (`npm run dev`) ook `http://localhost:5173` aan de Redirect URLs toevoegen.

- [ ] **1.5** Template **"Confirm signup"** stylen (Authentication → Email Templates):
      onderwerp + HTML-body met inline CSS in de app-kleuren
      (`--orange: #e66d35`, `--paper: #f7f1e8`), met `{{ .ConfirmationURL }}`.

- [ ] **1.6** Verifiëren dat het SQL-script is uitgevoerd: een testgebruiker aanmaken op een
      eigen adres moet lukken (geen `no_active_invite` meer), en `select * from public.invites`
      bestaat niet meer.

---

## Taak 2 — Auth-laag

- [x] **2.1** `src/composables/useAuth.ts`:
  - **Verwijderen:** `acceptInvite(email, password, token)` en `claimInvite(token)`.
  - **Nieuw:** `register(email, password): Promise<boolean>` → valideert (e-mail gevuld,
    wachtwoord ≥ 6) en roept `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`
    aan. Bij succes: `verificationEmail.value = email.trim()` en `return true`.
  - **Nieuw:** `resendVerification(email): Promise<boolean>` →
    `supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } })`.
  - **Nieuwe refs:** `verificationEmail: Ref<string | null>` (bepaalt de verificatiepagina) en
    `justVerified: Ref<boolean>` (groene banner), plus `setJustVerified(value)` op module-niveau
    (net als `setRecovery`), zodat `useDeepLink` hem kan zetten.
  - **`signIn`:** detecteer de Supabase-fout "email not confirmed" → zet
    `verificationEmail.value = email` en een leesbare NL-melding.
  - **`emailRedirectTo`:** native → `com.lijstjes.app://`, web → `window.location.origin` + `window.location.pathname`
    (zodat bevestigen in `npm run dev` te testen is). Eén helper, gebruikt door `register`
    én `resendVerification`.
  - Ongewijzigd laten: `resetPassword`, `updatePassword`, `signOut`, `init`, `recovery`.

- [x] **2.2** `src/lib/errorMessages.ts`:
  - Nieuwe constante `EMAIL_NOT_CONFIRMED = "Je e-mailadres is nog niet bevestigd. Vraag een
nieuwe verificatielink aan of klik op de link in je mail."`
  - `toAuthErrorMessage` uitbreiden met een regel voor "email not confirmed".
  - Rate-limit-melding herformuleren naar de verificatiecontext.
  - Invite-specifieke constanten (`INVITE_INVALID`, `INVITE_WRONG_EMAIL`) en hun regels
    verwijderen (geen enkele gebruiker meer).

- [x] **2.3** `src/lib/database.types.ts`: tabellen `invites`/`invite_claims`, de functie
      `claim_invite` en het hulptype `ClaimInviteResult` verwijderen. Eventueel de nieuwe
      functie `is_email_confirmed` als `Functions`-entry toevoegen (optioneel; de app roept
      hem niet rechtstreeks aan).

- [x] **2.4** `src/lib/inviteToken.ts`: `extractInviteToken` en `scrubInviteToken` verwijderen
      (geen uitnodigingslink meer). `readParams` en `APP_SCHEME` blijven; de module zo nodig
      hernoemen/herpositioneren (bijv. `src/lib/urlParams.ts`) — of minimaal de doc-comments
      bijwerken naar de bevestigings-/herstelcontext.

---

## Taak 3 — Views: Registreren-knop, registratie zonder token, verificatiepagina

- [x] **3.1** `src/components/LoginView.vue`:
  - Knop **`Registreren`** toevoegen (roept `emit("register")` aan); bestaande knoppen
    (`Inloggen`, `Wachtwoord vergeten?`) blijven.
  - Kleine **groene** succesmelding tonen wanneer `justVerified` waar is
    (bijv. `Je account is bevestigd.`).
  - Geen hint-teksten; de melding verschijnt alleen na een geslaagde bevestiging.

- [x] **3.2** `src/components/RegisterView.vue`:
  - Alle token-/invite-logica verwijderen: `fetchInvitedEmail`, `lookupInviteEmail`,
    `inviteToken`, `emailLocked`, `readonly` op het e-mailveld.
  - E-mailveld **bewerkbaar**; submit → `register(form.email, form.password)`.
  - Bij succes: niets lokaal tonen — `App.vue` schakelt door naar de verificatiepagina
    zodra `verificationEmail` is gevuld.
  - `Terug naar inloggen` (emit `cancel`) blijft.

- [x] **3.3** **Nieuw** `src/components/VerifyEmailView.vue` (zelfde `.login-card`-opbouw):
  - Exacte tekst: **`Er is een email verzonden naar <email>. Klik op de link in de mail om uw
account te accepteren.`** (met het werkelijke adres uit `verificationEmail`).
  - Link/knop **`Opnieuw een verificatielink opvragen`** → `resendVerification(email)`:
    - **60s-cooldown** na een verzoek (Supabase-drempel), knop tijdelijk uitgeschakeld;
    - vriendelijke melding bij succes én bij rate limit (geen ruwe fout/technische termen).
  - Knop **`Terug naar inloggen`** → `verificationEmail = null` (emit `back`).
  - `aria-live="polite"` op de melding; focus op de eerste actie bij openen.

- [x] **3.4** `src/App.vue`:
  - View-volgorde: `!initialized` → `user` → `recovery` → `verificationEmail` →
    `registerOpen` → `LoginView`.
  - `LoginView @register="registerOpen = true"`, `RegisterView @cancel="registerOpen = false"`,
    `VerifyEmailView @back="verificationEmail = null"`.
  - Nieuwe lokale ref `registerOpen` (of via een emit op `LoginView`).
  - Groene bevestigingsbanner: wanneer `justVerified` waar is, een klein groen
    `role="status"`-blok tonen, automatisch verbergen na ~4 s.
  - Het laadscherm (`showSplash`) blijft ongewijzigd bovenaan staan.

---

## Taak 4 — Deep link: bevestigings-callback + bugfix recovery/signup

- [x] **4.1** `src/lib/urlParams.ts` (was `inviteToken.ts`): `isRecoveryUrl` mag **niet** meer terugvallen op
      "heeft `access_token` + `refresh_token` + `#`", want dat vangt óók de
      signup-bevestiging. Splits in twee pure helpers op basis van `type`:
  - `isRecoveryUrl(url)` → `type=recovery`;
  - `isSignupConfirmationUrl(url)` → `type=signup` (of `email_change`) **én** een tokenpaar.

- [x] **4.2** `src/composables/useDeepLink.ts` — `handleIncomingUrl`:
  - **Recovery** (`type=recovery`): ongewijzigd → `setSession(...)` + `setRecovery(true)`.
  - **Bevestiging** (`type=signup`): `setSession({ access_token, refresh_token })` →
    `setJustVerified(true)`. De gebruiker is daarna ingelogd; de groene banner bevestigt.
  - Invite-extractie (`extractInviteToken`) en `inviteToken`-ref verwijderen.
  - Token uit de URL wissen (`history.replaceState`) — net als bij recovery.
  - `readCurrentLocation`: alleen nog voor de recovery/bevestigings-hash, niet meer voor `?invite=`.

- [x] **4.3** `src/composables/useDeepLink.spec.ts` bijwerken: signup-bevestiging levert géén
      `ResetPasswordView` op maar `justVerified`; recovery blijft werken.

- [x] **4.4** Android: **geen wijziging** — `com.lijstjes.app://` staat al in
      `AndroidManifest.xml`. Alleen documenteren in AGENTS.md §8.11.

---

## Taak 5 — Verwijder-dialog: knopstijl (Route B)

- [x] **5.1** `src/components/ConfirmDeleteDialog.vue` — template:

      ```html
      <div class="confirm-actions">
        <button class="dialog-action-button dialog-action-secondary" type="button" @click="onCancel">
          Annuleren
        </button>
        <button class="dialog-action-button dialog-action-primary" type="submit">
          Verwijderen
        </button>
      </div>
      ```

- [x] **5.2** Scoped `<style>` in `ConfirmDeleteDialog.vue` (eigen klassen; `.dialog-submit`
      blijft onaangeroerd):

      ```css
      .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 26px; }
      .dialog-action-button {
        min-height: 44px; padding: 0 16px; display: inline-flex;
        align-items: center; justify-content: center;
        border: 1px solid transparent; border-radius: 10px;
        font-size: 13px; font-weight: 700; line-height: 1.2;
      }
      .dialog-action-secondary { border-color: var(--line); color: var(--orange); background: transparent; }
      .dialog-action-secondary:hover { border-color: var(--orange); background: var(--orange-soft); }
      .dialog-action-primary { color: #fff; background: var(--orange); }
      .dialog-action-primary:hover { background: var(--orange-dark); }
      ```

- [x] **5.3** Opruimen: de `.secondary-button`-regels in `src/styles.css` verwijderen
      (alleen hier gebruikt) en de klasse `confirm-delete` laten vervallen (was nergens
      gestyled). Verifiëren met `grep -rn "secondary-button" src` → geen treffers meer.

- [x] **5.4** Beide knoppen even hoog (44px), kleinere tekst,
      "Annuleren" secundair/outline, "Verwijderen" primair/oranje; `.dialog-submit` op
      LoginView/RegisterView/ResetPasswordView/HomeView-dialog verandert niet.

---

## Taak 6 — Tests

- [x] **6.1** `src/composables/useAuth.spec.ts`: invite-tests vervangen door
      `register` / `resendVerification`; de test "géén open `signUp` in de API" verwijderen
      (registratie is nu open). `register` roept `signUp` aan met `emailRedirectTo`;
      bij `session: null` wordt `verificationEmail` gezet.
- [x] **6.2** `src/components/RegisterView.spec.ts`: herschrijven voor de token-loze flow
      (e-mail bewerkbaar, `signUp` met het ingevoerde adres, validatiefouten).
- [x] **6.3** `src/components/LoginView.spec.ts`: de test "geen registratieknop" omdraaien naar
      "heeft een Registreren-knop"; groene melding bij `justVerified` toetsen.
- [x] **6.4** **Nieuw** `src/components/VerifyEmailView.spec.ts`: exacte tekst met het adres,
      resend-aanroep, cooldown, terug-naar-inloggen.
- [x] **6.5** `src/composables/useDeepLink.spec.ts`: `type=signup` → `justVerified`,
      `type=recovery` → `recovery` (geen verwisseling meer).
- [x] **6.6** `src/lib/errorMessages.spec.ts`: invite-regels eruit; "email not confirmed"-regel
      erin.
- [x] **6.7** `npm run verify:data` blijft groen (data-laag/RLS aangeraakt → regressiecheck).

---

## Taak 7 — AGENTS.md bijwerken

> **Al doorgevoerd** bij het opstellen van dit plan (de gebruikersvraag was om ook `AGENTS.md`
> meteen aan te passen). Vandaar hieronder `[x]`.

- [x] **7.1** §7.6 **"Registratie op uitnodiging (verplicht)"** herschrijven naar
      **"Open registratie met e-mailverificatie"**:
  - geen token/uitnodiging meer; `supabase.auth.signUp` mag weer open;
  - verificatie via Supabase `Confirm email` + RLS-grendel `is_email_confirmed()`;
  - verificatiepagina met resend-link; zonder bevestiging geen toegang;
  - token-hash/tokens nooit loggen of in `localStorage` bewaren.
- [x] **7.2** §8.9 **Inlogpagina**: de regel "géén registratieknop" vervangen door
      "heeft een **Registreren**-knop die naar `RegisterView` gaat".
- [x] **7.3** §8.11 **Deep link**: invite-variant verwijderen; bevestigings-redirect
      (`com.lijstjes.app://` na `Confirm email`) en de recovery-flow documenteren.
- [x] **7.4** §13 **"Niet doen"**: "geen open registratie / geen publieke `signUp`" verwijderen;
      toevoegen: geen verificatie omzeilen, geen tweede bevestigingsmail beloven
      (bestaat niet), geen ruwe Supabase-fouten tonen.
- [x] **7.5** §4 **Projectstructuur**: `VerifyEmailView.vue` toevoegen; `inviteToken.ts`/
      `supabase-invites.sql` vervangen door de nieuwe namen
      (`urlParams.ts` / `supabase-verification.sql`), of anders de omschrijving bijwerken.
- [x] **7.6** §7.2 (database types): verwijzing naar `invites`/`claim_invite` verwijderen.

---

## Definition of Done

- [x] Implementatie voldoet aan de acceptatiecriteria hierboven.
- [x] `npm run typecheck` schoon.
- [x] `npm run test` groen — inclusief de gewijzigde/nieuwe spec-files.
- [x] `npm run build` slaagt.
- [x] `npm run verify:data` groen (data-laag/RLS aangeraakt).
- [x] `npm run format` toegepast op gewijzigde bestanden; `npm run format:check` schoon.
- [x] Geen `console.log` in productiecode.
- [x] Toegankelijkheid: focus, `aria-*`, ESC, `focus-visible`.
- [x] Cross-user isolatie niet gebroken.
- [x] Sync-gedrag correct (outbox FIFO, retry/backoff, indicatorstatus).
- [ ] Handmatig getest in de browser: registreren → verificatiepagina → (bevestigen) → groene
      banner; ongeverifieerd inloggen → terug naar verificatiepagina; resend met cooldown.
      **Nog te doen door de gebruiker**, ná uitvoering van taak 1 in Supabase.
- [x] Verwijder-dialog: gelijke hoogte, kleinere tekst, `.dialog-submit` elders onveranderd.
- [x] `dist/` en `android/app/src/main/assets/public/` niet handmatig bewerkt.
- [x] Taakregel pas op `[x]` na succesvolle afronding.

## Uitvoeringsnotities (afwijkingen van het plan)

- **Groene bevestiging (3.1/3.4):** de banner staat in `App.vue` (globaal, `role="status"`,
  auto-hide na 5 s) in plaats van in `LoginView`. Reden: bij auto-login na bevestiging landt
  de gebruiker in het overzicht en niet op de inlogpagina; één globale banner dekt beide
  gevallen (auto-login én de fallback naar de inlogpagina) zonder dubbele implementatie.
- **View-volgorde (3.4):** `recovery` staat vóór `user`. Met `user` eerst kon `ResetPasswordView`
  nooit verschijnen, omdat een recovery-link meteen een sessie zet. Dit is een bugfix.
- **Klasse­namen dialoog (5.1/5.2):** in de praktijk `.confirm-action` + `.is-danger` in plaats
  van `.dialog-action-button`/`.dialog-action-primary`; zelfde Route B-resultaat.
- **Resend-knop (3.3):** label is `Nieuwe verificatielink opvragen` (i.p.v. "Opnieuw een …").
- **URL-parser (2.4/4.1):** `inviteToken.ts` is hernoemd naar `urlParams.ts`; `APP_SCHEME`
  stond daar alleen voor de invite-parser en is verplaatst/vervangen door de helper in `useAuth`.
- **`detectSessionInUrl: false`:** `src/lib/supabase.ts` laat de URL-hash nu volledig aan
  `useDeepLink` (één plek die de tokens leest; maakt de webvariant deterministisch).

## Besluiten

| #   | Vraag                    | Besluit                                                            |
| --- | ------------------------ | ------------------------------------------------------------------ |
| 1   | Uitnodigingssysteem      | **Volledig verwijderen** (trigger, tabellen, RPC, link)            |
| 2   | Verificatielink-gedrag   | **Auto-login + groene banner** (standaard Supabase-flow)           |
| 3   | Tweede "bevestigd"-mail  | **Overslaan** — niet mogelijk met standaardtemplates; in-app tonen |
| 4   | SMTP-provider            | **Geen** — standaardaflevering Supabase (beperkt; geaccepteerd)    |
| 5   | Verwijder-dialog knoppen | **Route B** — eigen knopstijl, geen override van `.dialog-submit`  |
| 6   | Wachtwoordbeleid         | **Minimaal 6 tekens** (ongewijzigd)                                |
| 7   | Back-end controle        | `Confirm email` AAN + RLS-helper `is_email_confirmed()`            |

## Niet doen

- De DB-trigger `enforce_invite_on_signup` laten staan: dan faalt open registratie met
  `no_active_invite`, ongeacht wat de client doet.
- Verificatie-omzeiling: geen sessie/route die de gebruiker zonder bevestiging toegang geeft;
  RLS is de tweede laag.
- `signUp` een sessie laten gebruiken vóór bevestiging, of de bevestigingsstap client-side
  "vertrouwen" zonder de server-side `Confirm email` + RLS-grendel.
- `confirm email` uitzetten: dan is de eis "geen gebruik zonder verificatie" niet meer afdwingbaar.
- De verificatietokens loggen, in `localStorage` bewaren of in de UI tonen.
- `.dialog-submit` globaal aanpassen voor de verwijder-dialog (raakt 4 andere formulieren).
- `window.confirm` of een `<dialog>` gebruiken om items te verwijderen (dat blijft de
  twee-staps knop, §8.6).
- Beloven in de UI dat de verificatie-/herstelmail altijd aankomt (aflevering is beperkt).
- Een webhost opzetten of een SMTP-provider instellen.
- APK bouwen zonder expliciete goedkeuring.

---

## Taak 8 — Android release-APK + keystore (na expliciete goedkeuring)

- [x] **8.1** Versie opgehoogd naar **1.3** (`package.json` `1.3.0`; `android/app/build.gradle`
      `versionName "1.3"` + `versionCode 3`, consistent conform AGENTS.md §10.2).
- [x] **8.2** Eigen **release-keystore** aangemaakt in `Documenten/Projecten/code_26/.keys/`
      (`lijstjes-release.jks`, alias `lijstjes`, PKCS12, RSA 2048, 10.000 dagen) met een
      willekeurig wachtwoord. Wiring via `android/keystore.properties` (in `.gitignore`);
      `signingConfigs.release` in `android/app/build.gradle`. Eén back-up-map `.keys/`.
- [x] **8.3** `npm run test` (84 groen) + `npm run build` + `npm run android:sync`.
- [x] **8.4** Release-APK gebouwd:
      `JAVA_HOME=/opt/android-studio-for-platform/jbr ./gradlew assembleRelease`.
- [x] **8.5** APK gekopieerd naar `Lijstjes_1.3.apk` in de projectroot (`*.apk` staat in
      `.gitignore`). Geverifieerd met `aapt2`/`apksigner`: `package com.lijstjes.app`,
      `versionName 1.3`, `versionCode 3`, **geen** `debuggable`-vlag, ondertekend met
      `CN=Lijstjes` (de release-keystore).

> Uitgegeven als **release**-APK (ondertekend, geschikt om te delen). Play Store blijft open:
> dezelfde keystore dient later als upload key + Play App Signing; dan bouw je een AAB
> (`./gradlew bundleRelease`). Zonder `android/keystore.properties` is een release-APK
> ongetekend en niet installeerbaar (AGENTS.md §10.2).

---

## Toevoeging aan `tasks.md` (exact één regel)

Plaats deze regel onderaan de laatst beschreven fase in `tasks.md` (dus ná Fase 5):

```markdown
- [ ] Fase 6 — Open registratie + e-mailverificatie: zie [tasks_03.md](tasks_03.md).
```
