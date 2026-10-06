# task_02 — Uitnodigingsregistratie, dubbele bevestiging, laadscherm en UI-fixes

> Plan (nog **niet** uitgevoerd). Elke taak hieronder is één regel `[ ]` en wordt pas op `[x]`
> gezet nadat deze is geïmplementeerd **en** aantoonbaar getest (zie AGENTS.md §12).
> Voorgang wordt bijgewerkt in `tasks.md` (of in dit bestand als de gebruiker dat wil).

## 0. Context & werkwijze

- Project: Vue 3 + TypeScript (strict) + Vite + Supabase + Capacitor. Zie `AGENTS.md`.
- **Web-first**: alles bouwen en testen met `npm run dev` + `npm run build`.
  De Android-export (APK) is een **gated** laatste taak en gebeurt **pas na expliciete
  goedkeuring** van de gebruiker.
- Per taak: klein, testbaar, één ding tegelijk. Na elke taak `npm run typecheck`,
  `npm run build`, `npm run format` en handmatig testen in de browser.
- Nieuwe functionaliteit wordt **getest met vitest** (nieuw op te zetten, zie fase G).
- **De app draait als Android-app zonder webhost.** Er is dus geen Site URL in de
  betekenis van "adres van een webpagina". De registratie-uitnodiging komt binnen via
  een **deep link met eigen scheme**: `com.lijstjes.app://invite?token=…`.
  Zie fase A0.
- **Deze ronde wijzigt geen bestanden buiten de benodigde bronbestanden**;
  `dist/`, `www/` en `android/app/src/main/assets/public/` blijven onaangeroerd.

### Overzicht van de te leveren onderdelen

| #   | Onderdeel                         | Resultaat                                                                 |
| --- | --------------------------------- | ------------------------------------------------------------------------- |
| 1   | AGENTS.md opschonen               | Eerste taak; verouderde verwijzingen eruit                                |
| 1b  | AGENTS.md aanvullen               | Tweede taak; legt de nieuwe regels uit deze ronde vast                    |
| 2   | Deep link                         | `com.lijstjes.app://invite?token=…` opent de app; geen webhost nodig      |
| 2b  | Registratie via uitnodiging       | Alleen geldige, niet-gebruikte uitnodiging kan een account aanmaken       |
| 2c  | Wachtwoord herstellen             | Blijft werken, maar via de standaardmail van Supabase (beperkt)           |
| 3   | Items verwijderen (dubbele input) | Twee-staps bevestiging voor item-verwijderen én 'Verwijder afgevinkt'     |
| 4   | Laadscherm                        | `SplashView.vue` met titel + oranje streep + spinner rechtsonder          |
| 5   | Foutmelding synchronisatie        | Geen `TypeError` zichtbaar; label 'Fout bij synchroniseren'; klapt inklap |
| 6   | Accountmenu                       | Volgorde + oranje actieve knop + geen blauwe Android-tapflash             |
| 7   | Visuele fixes                     | Titelmarge, vierkante checkboxen, inlogpagina opschonen                   |
| 8   | Versienummer                      | Android `versionName "1.2"` (`versionCode 2`)                             |
| 9   | Vitest                            | Testsetup + tests voor alle nieuwe logica                                 |
| 10  | Android-build                     | **Alleen na goedkeuring**                                                 |

---

## Taak 1 — AGENTS.md OPSCHONEN (EERSTE taak)

**Doel**: `AGENTS.md` bevat inmiddels verouderde verwijzingen (zie onderaan) en wordt
daarom eerst echt opgeruimd. Pas daarna komen de nieuwe regels erbij (taak 2).
`AGENTS.md` wordt in deze ronde dus **niet** inhoudelijk aangepast — alleen deze
takenlijst vastgelegd.

Bekende verouderingen om op te ruimen (geverifieerd tegen de huidige repo):

| Plaats                   | Probleem                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3 (commands)            | Noemt `npm run android:debug` als bestaand script; dat bestaat niet meer (`android:build` = release-APK).                                         |
| §3 (commands)            | `npm run verify:data` omschrijving klopt nog, maar het script staat niet in de tabel-kolom consistent; `npm run test` (vitest, nieuw) moet erbij. |
| §4 (structuur)           | Noemt `legacy/`, `www/`, `app.js`, `supabase.config.js`, `Lijstjes.apk` — die zijn in fase 4 verwijderd.                                          |
| §9 (stijl)               | Noemt `dist/` als bestaand bij de projectstructuur; ook het advies "Google Fonts blijft in index.html, hosten in fase 4" is een fase-4-restant.   |
| §11 (bekende problemen)  | Tabel met legacy-bestanden (`app.js:163–165`, `legacy/index.html:213`) die niet meer bestaan.                                                     |
| §12 (Definition of Done) | Mist de verplichte vitest-stap.                                                                                                                   |
| §10.2 (Android)          | Noemt `--androidreleasetype APK` als debug-optie; in werkelijkheid is `./gradlew assembleDebug` de debug-route (zie `tasks.md` fase 4).           |

- [x] **1.1** `AGENTS.md` volledig doorlezen en de verouderde delen hierboven corrigeren of
      verwijderen (geen nieuwe functionaliteit toevoegen — dat is taak 2).
- [x] **1.2** Projectstructuur-sectie (`§4`) synchroniseren met de werkelijke mappenboom
      (`supabase-invites.sql` toevoegen).
- [x] **1.3** `§11` herschrijven als korte "lessons learned" (wat níet meer doen) in plaats van
      een verwijzing naar bestanden die opgeruimd zijn.
- [x] **1.4** `§12` uitbreiden met `npm run test` als harde eis.
- [x] **1.5** Controle: alle paden/commando's in `AGENTS.md` bestaan echt (steekproef met `ls`).

---

## Taak 2 — AGENTS.md AANVULLEN met de nieuwe regels

**Doel**: de onderdelen hieronder worden afdelingsregels voor het hele project. Ze komen pas
in `AGENTS.md` ná de opschoning van taak 1, zodat het document geen mix van oude en nieuwe
regels wordt.

- [x] **2.1** `AGENTS.md` aanvullen met:
  - **Nieuwe sectie "Registratie op uitnodiging"**:
    - Er is géén open registratie. `supabase.auth.signUp` is alleen toegestaan vanuit
      `RegisterView.vue` en uitsluitend met een geldig, ongebruikt, niet-verlopen token.
    - Server-side afdwinging via een `before insert on auth.users` **trigger** in
      `supabase-invites.sql`; een token checken in de client is géén beveiliging.
    - **Besluit: trigger + `invites`-tabel** (geen Edge Function/service role in de app).
    - Uitnodigingen worden **handmatig** aangemaakt (Supabase SQL Editor / Dashboard),
      nooit vanuit de app; `anon`/`authenticated` hebben geen rechten op `invites`.
    - Een uitnodiging is **eenmalig** en verloopt na **7 dagen** (`expires_at`).
    - Wachtwoordbeleid: **minimaal 6 tekens** (ongewijzigd tegenover huidige app).
    - De registratiepagina gebruikt de RPC `claim_invite(token)`, niet `is_invite_valid`.
    - Token wordt na het uitlezen uit de URL verwijderd (`history.replaceState`).
  - **Nieuwe sectie "Dubbele bevestiging voor verwijderen"**: eerste klik = 'geactiveerd'
    (oranje achtergrond, `aria-pressed="true"`), tweede klik = uitvoeren;
    **er is altijd maar één knop armed** (een nieuwe arming herstelt de vorige);
    auto-herstel na **5 seconden**; ESC/verlaten/timeout herstelt.
  - **Nieuwe sectie "Laadscherm"**: `SplashView.vue` zichtbaar totdat auth + eerste
    hydrate klaar is; niet scrollbaar; spinner rechtsonder; `aria-busy`.
  - **Sync-indicator**: fouttekst wordt gemapt naar leesbare NL-teksten
    (`TypeError`/onbekende fouten → generieke fallback), label `Fout bij synchroniseren`,
    inklaplogica (1,5s → alleen dot) geldt óók voor de foutstatus.
  - **Accountmenu**: volgorde `+ Nieuw lijstje` → `Account` → e-mail → `Uitloggen`;
    accountknop is oranje zolang het menu open is; `-webkit-tap-highlight-color: transparent`.
  - **Inlogpagina**: géén registratieknop en géén uitnodigingstekst (geen hint).
  - **Testing**: `vitest` is verplicht voor nieuwe/nieuwe logica; `npm run test` +
    `npm run build` (typecheck) schoon vóór een taak op `[x]` mag.
  - **Versienummer**: Android-versie in `android/app/build.gradle` (`versionName "1.2"`,
    `versionCode 2`) **én** `package.json` `version: "1.2.0"` — beide bijgewerkt houden.
    Bij een release-build eerst akkoord vragen.
- [x] **2.2** Wijzigingsvoorstel aan de gebruiker tonen en pas na akkoord toepassen.
- [x] **2.3** `tasks.md` aanvullen met deze fase (`Fase 5`) zodat voortgang op één plek staat.

---

## Fase A — Registratie op uitnodiging

### A0. Deep link (`com.lijstjes.app://`) — VÓÓR de rest van fase A

**Waarom eerst:** de rest van fase A gaat een uitnodigingstoken uit een URL lezen. Op
Android is er geen URL om te lezen — de app wordt vanaf het startscherm geopend en heeft
geen adresbalk. Zonder deep link komt het token simpelweg nooit aan. Daarom staat deze
fase vóór `RegisterView.vue`, anders bouw je de registratiepagina op een token-bron die
nog niet bestaat.

**Wat al klaar is:** `android/app/src/main/res/values/strings.xml` bevat al
`<string name="custom_url_scheme">com.lijstjes.app</string>`. Het scheme hoeft dus niet
meer gekozen te worden; alleen de koppeling naar Android ontbreekt nog.

- [x] **A0.1** Dependency: `npm i @capacitor/app` (productie-dependency, geen devDependency).
      Geïnstalleerd als `@capacitor/app` 8.1.2, passend bij `@capacitor/core` 8.5.2.
- [x] **A0.2** `npx cap sync android` zodat de plugin in het Android-project terechtkomt.
      Uitvoer bevestigt de registratie: "Found 1 Capacitor plugin for android: @capacitor/app@8.1.2".
- [x] **A0.3** `android/app/src/main/AndroidManifest.xml`: **een tweede** `<intent-filter>`
      in de `<activity>` toevoegen, ná de bestaande MAIN/LAUNCHER-filter:

      ```xml
      <intent-filter>
          <action android:name="android.intent.action.VIEW" />
          <category android:name="android.intent.DEFAULT" />
          <category android:name="android.intent.BROWSABLE" />
          <data android:scheme="@string/custom_url_scheme" />
      </intent-filter>
      ```

      **Niet** `android:autoVerify="true"` gebruiken: dat is alleen voor Android App
      Links op een gedomein dat je bezit, en het zou de custom scheme juist laten
      falen. De bestaande `android:launchMode="singleTask"` blijft zoals die is.
      **Uitgevoerd:** de tweede `<intent-filter>` staat in de `<activity>`, ná de
      MAIN/LAUNCHER-filter, met een verklarend XML-commentaar. Alleen deze
      intent-filter is toegevoegd; niets anders in het bestand is gewijzigd.

- [x] **A0.4** `src/App.vue` of een kleine composable `useDeepLink()`: bij het opstarten
      `App.getLaunchUrl()` aanroepen (de app kan met een link worden geopend) **én** een
      `App.addListener("appUrlOpen", …)` registreren voor als de app al draait.
      De listener weghalen in `onBeforeUnmount`.
      **Uitgevoerd:** nieuwe `src/composables/useDeepLink.ts` met `initDeepLink()` en
      `disposeDeepLink()`. `App.vue` roept die aan vanuit zijn eigen `onMounted` /
      `onBeforeUnmount`. `@capacitor/app` wordt dynamisch geïmporteerd zodat de
      web-build geen native code laadt; buiten Capacitor (`isNativePlatform()`) is
      deep-link-afhandeling een no-op. Bij een HMR-herlaadbeurt stapelen listeners op;
      daarom worden ze in een array bijgehouden en in `disposeDeepLink()` allemaal
      verwijderd.
- [x] **A0.5** De ontvangen URL parsen naar een token. Te accepteren bronnen:
      `com.lijstjes.app://invite?token=ABC` (native), `?invite=ABC` (web, `npm run dev`)
      en `#invite=ABC` (web, variant met hash).

      Bij de native bron de URL **niet** in de WebView terecht laten komen: het token uit
      het intent halen en weggooien. Bij de web-bronnen wél `history.replaceState`, zodat
      de token niet in de URL-balk of de historie achterblijft. In geen van beide
      gevallen het token loggen of in `localStorage` zetten.
      **Uitgevoerd:** `extractInviteToken()` leest zowel query als hash en werkt op de
      ruwe string in plaats van via `new URL`, omdat die bij een custom scheme alles
      achter `//` als host leest. Bij de webvariant haalt `readCurrentLocation()` de
      token uit `window.location.href` en schrijft daarna `history.replaceState`,
      zodat alleen het token-stuk verdwijnt en overige query-parameters blijven staan.
      De native intent-URL wordt nooit in de WebView gezet.

- [x] **A0.6** Negatief: een link met een onbekend of afwezig token opent de app, maar
      toont de **inlogpagina** met een leesbare NL-melding — nooit een stack trace.
      **Afgerond samen met A3.5 en A4.** _Afwijking:_ in plaats van meteen de
      inlogpagina toont de app de registratiepagina met de melding `Deze uitnodiging
is ongeldig of verlopen.` en een knop `Terug naar inloggen`. Dat volgt de
      view-tabel van A4.2 (`!user && inviteToken` → `RegisterView`) plus A3.5 en is
      bruikbaarder: de gebruiker ziet waarom de link niet werkt.
- [ ] **A0.7** Testen op het apparaat (of de emulator), want dit werkt alleen op Android:
      `adb shell am start -a android.intent.action.VIEW -d "com.lijstjes.app://invite?token=test"`.
      In de browser werkt het niet; daar geldt de `?invite=`-variant.
      **Let op:** de deep link kan een ambiguïteitsdialoog geven als een andere app het
      zelfde scheme claimt. `com.lijstjes.app` is uniek genoeg om dat te vermijden.

  **Overgeslagen op verzoek van de gebruiker** ("sla voor nu a0.7 … over"). Blijft open
  tot de Android-export (fase H).

### A1. Database: `invites`-tabel + trigger

**Het SQL staat klaar als kopieerklare sjabloon: `supabase-invites.sql`** (in deze ronde
aangemaakt). Dat bestand is de enige bron van waarheid voor dit schema; hieronder staat
alleen wat de app-code ervan gebruikt.

- [x] **A1.1** `supabase-invites.sql` doorlopen met de beheerder en bevestigen dat de
      Auth-instellingen kloppen (zie checklist onderaan dat bestand: Email-provider aan,
      "Allow new users to sign up" aan, keuze e-mailbevestiging, en Site URL +
      Redirect URLs op `com.lijstjes.app://` — die laatste twee zijn alleen nodig voor
      de herstelmail, zie A6).

  **Bevestigd door de gebruiker:** "supabase instellingen staan goed". Dat dekt de
  Auth-instellingen (A1.6). Het zegt niets over het uitvoeren van het SQL-script
  zelf (A1.2) — blijft daarom open.

**Wat het sjabloon bevat:**

| Object                                          | Rol                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `public.invites` (RLS aan, geen policies)       | Uitnodigingen; `token`, `email`, `note`, `expires_at` (7 dagen), `used_at`, `used_by`. Alleen de beheerder leest/schrijft.             |
| `public.invite_claims` (RLS aan, geen policies) | Bewijs dat de registratiepagina het token heeft opgeëist; geldig 15 minuten.                                                           |
| `public.claim_invite(token)`                    | RPC die de pagina aanroept: `valid` + `email` terug, en schrijft de claim.                                                             |
| `public.enforce_invite_on_signup()` + trigger   | `before insert on auth.users`: geen account zonder geldige claim + uitnodiging voor dít e-mailadres; verbruikt de uitnodiging atomair. |

- [ ] **A1.2** **Uitvoeren in de SQL Editor van het Supabase-project** (kan niet vanuit de
      repo): het hele `supabase-invites.sql`-script plakken en Run. Daarna blok 6
      ("UITNODIGING MAKEN") per gebruiker uitvoeren; de query geeft de registratielink terug
      in de vorm `com.lijstjes.app://invite?token=…`.

  **Overgeslagen op verzoek van de gebruiker.** Let op de consequentie: zolang dit niet
  draait, geeft `claim_invite` een fout en toont de app overal `Deze uitnodiging is
ongeldig of verlopen.` — de app doet het juiste, maar registratie is onmogelijk zolang
  het schema niet in de database staat.

- [x] **A1.3** Zelf-test uit blok 5 van het sjabloon uitvoeren: `claim_invite('bestaat-niet')`
      moet `valid = false` teruggeven.

  **Bevestigd door de gebruiker: "a1.3 is succesvol".**

- [ ] **A1.4** Negatieve test (belangrijkste security-test, doe dit zelf of laat het uitvoeren):
      roep `supabase.auth.signUp` rechtstreeks aan met de **anon key** en een e-mailadres
      dat wél een uitnodiging heeft maar **zonder** token → moet geweigerd worden met
      `no_active_invite`, en er ontstaat géén account.

  **Overgeslagen op verzoek van de gebruiker.**

- [ ] **A1.5** Positieve test: `claim_invite('<geldig token>')` gevolgd door de registratiepagina
      met dat token → account wordt aangemaakt, uitnodiging staat op `gebruikt`.

  **Overgeslagen op verzoek van de gebruiker.**

- [x] **A1.6** **Supabase-instelling afronden** (Authentication):
  - **"Confirm email" op UIT** (besluit variant A) — anders krijgt de gebruiker een mail die
    hij niet nodig heeft en is het account pas bruikbaar na bevestiging;
  - **"Allow new users to sign up" op AAN laten** — de trigger uit stap 4 is de poortwachter,
    niet deze toggle. Staat hij uit, dan kan niemand meer een account aanmaken, ook niet met
    een geldig token;
  - **URL Configuration: Site URL = `com.lijstjes.app://` en Redirect URLs =
    `com.lijstjes.app://`.** Dat is het app-schema, _geen_ webadres: de app draait als
    Android-app zonder webhost. Supabase ondersteunt custom schemes expliciet voor mobiel.
    Deze twee regels zijn **alleen nodig voor de herstelmail** (A6); de registratie zelf
    gebruikt geen redirect;
  - **GEEN SMTP instellen** — bewust besluit. Gevolg: de herstelmail is beperkt en
    onbetrouwbaar. Zie A6 en de uitleg onderaan `supabase-invites.sql`.

  **Bevestigd door de gebruiker:** "supabase instellingen staan goed". De code is hier
  al op voorbereid: `resetPassword` geeft `redirectTo: "com.lijstjes.app://"` mee en de
  UI waarschuwt expliciet dat de mail kan uitblijven.

- [x] **A1.7** `src/lib/database.types.ts` uitbreiden met de types van `claim_invite` (retourtype)
      en de nieuwe tabellen, zodat de RPC-call type-safe is. `invites` en `invite_claims`
      staan erin met `Insert: never` / `Update: never` (de app mag ze niet beschrijven),
      plus de functie `claim_invite` en een hulptype `ClaimInviteResult`.

### A2. Auth-laag

- [x] **A2.1** `src/composables/useAuth.ts`:
  - **Verwijder** de open `signUp(email, password)` uit de publieke API van de composable
    (huidige registratie-logica komt te vervallen).
  - Nieuwe functie `acceptInvite(email, password, token)` die:
    1. eerst `supabase.rpc("claim_invite", { in_token: token })` aanroept;
    2. bij `valid === false` → `error.value = "Deze uitnodiging is ongeldig of verlopen."`;
    3. bij een email-mismatch → `error.value = "Deze uitnodiging is voor een ander e-mailadres."`;
    4. anders `supabase.auth.signUp({ email, password })` (de trigger doet de echte check).
  - De fout van de trigger (`no_active_invite` komt terug als Supabase-fout) ook mappen naar
    `Deze uitnodiging is ongeldig of verlopen.` zodat er geenEngelse databasefout lekt.
  - `resetPassword` blijft ongewijzigd aanwezig.

  **Uitgevoerd:** de open `signUp` is weg; de enige plek die
  `supabase.auth.signUp` aanroept is nu `acceptInvite`. Volgorde is claim →
  email-check → wachtwoordlengte → `signUp`. Een email-mismatch levert
  `INVITE_WRONG_EMAIL`, een ongeldige claim `INVITE_INVALID`, en de triggerfout wordt
  via `toAuthErrorMessage` (nieuw bestand `src/lib/errorMessages.ts`) op dezelfde
  NL-tekst gemapt. De constanten `INVITE_INVALID` en `INVITE_WRONG_EMAIL` staan in
  `errorMessages.ts`, zodat de tekst op één plek staat; fase C breidt dat bestand uit
  met de sync-fouten.

- [x] **A2.2** `useAuth` **testbaar** maken: verhuis `onMounted(() => void init())` uit de
      composable naar `App.vue` en exposeer `init()`. Reden: `onMounted` buiten een component-context
      faalt onder vitest. Er komt één plek die de auth initialiseert.

  **Uitgevoerd:** `useAuth` bevat geen `onMounted` meer en exposeert `init()`;
  `App.vue` roept `void init()` aan in zijn eigen `onMounted`, naast
  `initDeepLink()`.

- [x] **A2.3** Bij succesvolle registratie: als `data.session` bestaat → de gebruiker is direct
      ingelogd (App.vue schakelt automatisch naar het overzicht). Ontbreekt de sessie →
      toon `Controleer je e-mail om je account te bevestigen.` (beleid Supabase blijft leidend).

  **Uitgevoerd:** bij een sessie geeft `acceptInvite` `true` terug zonder foutmelding,
  waarna de bestaande `watch(user)` in `App.vue` naar het overzicht schakelt. Zonder
  sessie blijft de melding staan; de submitknop blijft beschikbaar zodat het scherm
  niet alleen een dode melding toont.

### A3. `RegisterView.vue` (nieuw component)

- [x] **A3.1** `src/components/RegisterView.vue` aanmaken, `<script setup lang="ts">`,
      visueel gebaseerd op `LoginView.vue` (zelfde `.login-card`, `.login-title`, `.eyebrow`,
      `.dialog-submit`, focusring) zodat het één app blijft.

  **Uitgevoerd:** `src/components/RegisterView.vue`, `<script setup lang="ts">`, en
  volledig op de bestaande klassen (`.login-card`, `.login-title`, `.eyebrow`,
  `.login-form`, `.login-message`, `.dialog-submit`, `.password-field`, `.app-mark`).
  Er is geen nieuwe CSS toegevoegd.

- [x] **A3.2** Inhoud:
  - titel `Lijstjes` + eyebrow `ACCOUNT AANMAKEN`;
  - e-mailadres (vooringevuld en **readonly** als het uit het token komt), wachtwoord
    (**min. 6 tekens**), wachtwoord herhalen;
  - submit `Account aanmaken`, link/knop `Terug naar inloggen`;
  - `form.message` in een `aria-live="polite"`-regel voor fouten/succes.

  **Uitgevoerd:** eyebrow `ACCOUNT AANMAKEN`, submit `Account aanmaken`, knop
  `Terug naar inloggen` (emit `cancel`). Het e-mailveld wordt bij openen opgehaald
  via `claim_invite` en daarna `readonly`; alleen als het adres niet op te halen
  blijft het veld bewerkbaar, zodat het scherm niet onbruikbaar wordt.

- [x] **A3.3** Validatie: velden niet leeg, wachtwoorden gelijk, wachtwoord ≥ **6 tekens**
      (`minlength="6"`, `.login-message` voor de melding), e-mail-formaat.

  **Uitgevoerd:** `validate()` in de component controleert leeg, wachtwoordlengte
  (6) en gelijkheid; de e-mail-formaatcontrole laat de browser doen
  (`type="email"` + `novalidate` op de form zodat wij de eigen melding tonen in
  plaats van een browser-bubble).

- [x] **A3.4** Toegankelijkheid: `<label>` bij elk veld, focus op het eerste veld bij openen,
      `aria-describedby` voor de foutmelding, `autocomplete="new-password"`.

  **Uitgevoerd:** elk veld heeft een `<label>`, de foutregel heeft `id` +
  `aria-describedby="register-message"` en `aria-live="polite"`, en het eerste veld
  krijgt de focus zodra het adres uit de uitnodiging bekend is.

- [x] **A3.5** Status buiten de registratiepagina: bij ontbrekend/ongeldig token een leesbare
      NL-melding + link naar inloggen. Geen stack traces of ruwe Supabase-berichten tonen.

  **Uitgevoerd:** zonder bruikbare uitnodiging toont `RegisterView` `Deze link is
niet (meer) geldig. Vraag een nieuwe uitnodiging.` of `Deze uitnodiging is
ongeldig of verlopen.`, plus de knop `Terug naar inloggen`. De `claim_invite`-fout
  wordt weggeschreven in plaats van getoond; hetzelfde geldt voor `acceptInvite`.

- [x] **A3.6** ~~Knop 'Verstuur de bevestigingsmail opnieuw'~~ — **VERVALLEN**: met
      e-mailbevestiging uit is er geen bevestigingsmail en dus geen resend-knop nodig.

### A4. Navigatie zonder router (`App.vue`)

- [x] **A4.1** Token uit de URL lezen. **Het werk gebeurt in A0**; hier staat alleen wat de
      `App.vue` eraan overneemt: één `inviteToken`-ref die gevuld wordt door de parser uit
      A0. De web-bronnen (`?invite=` en `#invite=`) horen daar ook bij, zodat registratie in
      `npm run dev` te testen blijft. Na het uitlezen `history.replaceState` bij de
      web-bronnen, zodat de token niet in de historie/URL-balk blijft staan. Bij een deep
      link komt het token nooit in de WebView-URL terecht.
      ~~`src/App.vue`: uit `?invite=<token>`~~ **én** uit de hash (`#invite=<token>`) de
      ~~token lezen (robuost tegen beide varianten), daarna `history.replaceState` zodat de token niet~~
      ~~in de historie/URL-balk blijft staan.~~

  **Uitgevoerd:** `inviteToken` is een module-ref in
  `src/composables/useDeepLink.ts` en wordt door `App.vue` uitgelezen. Het pure
  URL-lezen staat in `src/lib/inviteToken.ts` (`extractInviteToken`, `readParams`,
  `scrubInviteToken`), zonder Vue- of Supabase-import, zodat het los testbaar
  blijft. Geverifieerd tegen negen URL-varianten (native, `?invite=`, `#invite=`,
  met een extra query-parameter, URL-encoded, leeg, zonder token en twee
  recovery-varianten).

- [x] **A4.2** View-selectie (geen Vue Router, conform AGENTS.md §5):

  | Voorwaarde              | View                |
  | ----------------------- | ------------------- |
  | `!initialized`          | `SplashView`        |
  | `user`                  | overzicht + detail  |
  | `!user && inviteToken`  | `RegisterView`      |
  | `!user && !inviteToken` | `LoginView`         |
  | `!user && recovery`     | `ResetPasswordView` |

  **Uitgevoerd:** één `v-if`/`v-else-if`-keten in de template van `App.vue`, in deze
  volgorde: `!initialized` → `user` → `recovery` → `inviteToken` → `LoginView`.
  Geen Vue Router (AGENTS.md §5). Het laadscherm zelf is fase B; tot die tijd blijft
  de bestaande `Bezig met laden…`-regel staan.

- [x] **A4.3** Na succesvolle registratie: token uit state wissen en door de `user`-watch naar het
      overzicht laten gaan (bestaande `watch(user)` in `App.vue` blijft de enige plek die hydrate/sync koppelt).

  **Uitgevoerd:** de component reset `acceptInvite` niet; de `user`-watch in
  `App.vue` schakelt vanzelf over. `inviteToken` wordt alleen geleegd als de
  gebruiker zelf op `Terug naar inloggen` klikt.

- [x] **A4.4** Bij uitloggen blijft een aanwezige uitnodigingstoken geldig staan, zodat de
      registratiepagina niet ineens verdwijnt.

### A5. Inlogpagina opschonen

- [x] **A5.1** `src/components/LoginView.vue`:
  - verwijder de **'Registreren'**-knop en de functie `onSignUp`;
  - verwijder de tekst **`Een nieuw account vereist mogelijk bevestiging via e-mail.`**;
  - verwijder de `signUp`-import uit `useAuth()`;
  - behoud: e-mail, wachtwoord, wachtwoord-tonen, `Inloggen`, `Wachtwoord vergeten?`
    en de Supabase-niet-geconfigureerd-melding.

  **Uitgevoerd:** de knop `Registreren`, de functie `onSignUp`, de destructuring van
  `signUp` en de overgebleven `submit`-tekst in de form-state zijn allemaal weg. De
  Supabase-niet-geconfigureerd-melding staat er nog.

- [x] **A5.2** `src/styles.css`: `.secondary-button`-regels opruimen **alleen** als na
      `grep -rn "secondary-button" src` geen andere gebruiker blijft (stap is optioneel).

  **Uitgevoerd / bewust overgeslagen:** `secondary-button` wordt nog door
  `ConfirmDeleteDialog.vue` gebruikt, dus de CSS-regels blijven staan. Geen
  opschoning.

- [x] **A5.3** **Geen vervangende tekst.** De regel met
      `Een nieuw account vereist mogelijk bevestiging via e-mail.` wordt gewoon **verwijderd**
      en komt niet terug in een andere vorm: de inlogpagina toont alleen het formulier,
      `Inloggen` en `Wachtwoord vergeten?`. Wie een account nodig heeft, krijgt de
      registratielink rechtstreeks van de beheerder.

  **Uitgevoerd:** de regel is verwijderd en komt nergens anders terug. `LoginView`
  toont alleen het formulier, `Inloggen` en `Wachtwoord vergeten?`.

### A6. Wachtwoord herstellen afmaken — **bewust zonder SMTP**

**Besluit:** de knop `Wachtwoord vergeten?` blijft staan en de functie wordt echt
werkend gemaakt. Er wordt **geen eigen SMTP-provider** ingesteld.

**Wat dat concreet betekent, zodat niemand het later vergeet:**

|                      |                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wat werkt            | De flow van "vergeten" → app opent → nieuw wachtwoord instellen                                                                                                                     |
| Wat onbetrouwbaar is | De **mail** zelf. Supabase gebruikt de standaardaflevering: harde limiet van enkele mails per uur en een hoge kans op spam. De mail kan dus uitblijven of in de prullenbak belanden |
| Vangnet              | De beheerder maakt een nieuw account of zet zelf een nieuw wachtwoord via de SQL Editor                                                                                             |

Dit vangnet is geen aanvulling maar de hoofdroute: bij een app zonder webhost en zonder
eigen mailer is "vraag het de beheerder" de enige route die altijd werkt. Beide paden
blijven bestaan.

- [x] **A6.1** `src/composables/useAuth.ts`: `resetPassword(email)` blijft `resetPasswordForEmail(email)`
      aanroepen, maar met **`redirectTo: "com.lijstjes.app://"`.** Zonder die parameter
      wijst de mail terug naar de Site URL; met deze parameter opent de herstellink de app.

  **Uitgevoerd:** `redirectTo: \`${APP_SCHEME}://\``met`APP_SCHEME =
  "com.lijstjes.app"`als module-constante naast`MIN_PASSWORD_LENGTH`, zodat de
  waarde op één plek staat.

- [x] **A6.2** De recovery-sessie opvangen. De deep link arriveert als intent, dus de
      bestaande `onAuthStateChange` in `useAuth.ts` ziet het niet als page-load. In de
      deep-link-parser (A0.5) het URL-object met de sessie doorgeven aan
      `supabase.auth.getSessionFromUrl({ url })`, zodat het recovery-token wordt ingelogd.

  **Uitgevoerd, met afwijking:** `getSessionFromUrl` bestaat in de geïnstalleerde
  `@supabase/auth-js` niet als publieke API — `_getSessionFromURL` is `private` en
  dus niet aanroepbaar zonder een onveilige cast. Omdat `flowType` standaard
  `implicit` is, zit het tokenpaar in de hash van de herstellink.
  `useDeepLink.handleIncomingUrl` leest die hash daarom zelf en roept de wel publieke
  `supabase.auth.setSession({ access_token, refresh_token })` aan. De herkenning loopt
  op de inhoud (`type=recovery`, of een compleet tokenpaar in de hash) en niet op het
  pad, omdat het terugstuurpad niet gegarandeerd is.

- [x] **A6.3** `useAuth.ts` blootstellen van een `recovery`-ref: zet die op `true` bij het
      `PASSWORD_RECOVERY`-event, en terug op `false` zodra het wachtwoord is ingesteld.

  **Uitgevoerd:** `useAuth` exposeert de ref `recovery` plus een module-functie
  `setRecovery(value)`. `setRecovery(true)` wordt vanuit twee plekken gezet: de
  `PASSWORD_RECOVERY`-listener in `init()`, en vanuit `useDeepLink` zodra de
  herstel-link een geldige sessie opleverde. `updatePassword` en `signOut` zetten hem
  terug op `false`. **Waarom niet alleen het event:** `setSession` vuurt `SIGNED_IN`,
  niet `PASSWORD_RECOVERY` — alleen op het event zou de deep-link-route missen.

- [x] **A6.4** `src/components/ResetPasswordView.vue` (nieuw): visueel gebaseerd op
      `LoginView.vue` (zelfde `.login-card`), met twee wachtwoordvelden, minimum **6 tekens**,
      `autocomplete="new-password"`, focus op het eerste veld, foutmelding in
      `aria-live="polite"`, en een link `Terug naar inloggen`.

  **Uitgevoerd:** `src/components/ResetPasswordView.vue`, dezelfde klassen als
  `RegisterView`, eyebrow `NIEUW WACHTWOORD`, submit `Wachtwoord opslaan`, knop
  `Terug naar inloggen` (emit `cancel`).

- [x] **A6.5** Nieuwe functie `updatePassword(newPassword)` in `useAuth.ts` die
      `supabase.auth.updateUser({ password })` aanroept en daarna de recovery-status wist.
      Bij succes: terug naar het overzicht (de sessie is nu een echte login).

  **Uitgevoerd:** `updatePassword` valideert de lengte, roept
  `supabase.auth.updateUser({ password })` aan, mapped de fout met
  `toAuthErrorMessage` en wist de herstel-status. Na succes blijft de sessie staan,
  waardoor `App.vue` vanzelf het overzicht toont.

- [x] **A6.6** `LoginView.vue`: houd de bestaande `form.message`-regel, maar maak de tekst
      expliciet over de beperkte aflevering. Niet beloven dat de mail altijd komt:
      `Als dit e-mailadres bekend is, ontvang je een herstelmail. Die kan door de afleverbeperking van Supabase wel eens uitblijven of in de spam belanden — vraag dan de beheerder om een nieuw wachtwoord.` Geen technische termen als "rate limit" of "SMTP" in de UI.
- [ ] **A6.7** Testen op het apparaat: herstelmail aanvragen, de link openen, de app moet
      het scherm voor een nieuw wachtwoord tonen in plaats van de inlogpagina.
      **Dit kan niet in `npm run dev`** — daar is geen recovery-link.

  **Overgeslagen op verzoek van de gebruiker.** Blijft open tot fase H.

---

## Fase B — Items verwijderen via dubbele bevestiging

- [x] **B1** Nieuwe kleine composable `src/composables/useArmedConfirm.ts` (bewust generiek,
      herbruikbaar voor beide knoppen) met:
  - **één enkele `armedId: Ref<string | null>`** — er kan dus maar **één knop tegelijk armed
    zijn**; het armen van een andere knop herstelt de vorige automatisch;
  - `arm(id)`, `disarm()`, `isArmed(id)`;
  - **twee-staps gedrag**: eerste aanroep `arm(id)` → alleen activeren; tweede aanroep op
    dezelfde id → callback `onConfirm(id)` uitvoeren (en daarna disarmen);
  - auto-disarm na **`ARM_TIMEOUT_MS = 5000`** (één timer voor alle ids);
  - `disarm()` bij: `activeListId`-wissel, item verdwijnt uit de lijst, `visibilitychange`
    (tab naar achtergrond), en ESC-toets.

  **Uitgevoerd:** `src/composables/useArmedConfirm.ts` (geen singleton, geen
  `onMounted`, `dispose()` voor de listeners). Logica geexecuteerd met node
  (twee-staps confirm, één armed tegelijk, 5s auto-restore, ESC,
  `visibilitychange` hidden, dispose) — allemaal correct.

- [x] **B2** `ListDetailView.vue`:
  - **Item-verwijderknop**: eerste klik zet `is-armed` (achtergrond `var(--orange)`,
    wit icoon, zichtbaar ook zonder hover → `.item-delete-button.is-armed { opacity: 1 }`),
    tweede klik verwijdert het item (`deleteItem(item.id)`).
  - **'Verwijder afgevinkt'**: eerste klik zet `is-armed` op de clear-knop
    (oranje achtergrond, witte tekst/icoon, `(n)` blijft zichtbaar),
    tweede klik voert `clearCompleted(listId)` uit.
  - `aria-pressed` op beide knoppen; `aria-label` verandert naar
    `Bevestigen: item verwijderen` / `Bevestigen: afgevinkte items verwijderen` in de
    armed staat (het woord 'verwijderen' blijft in de label staan voor screenreaders).
  - Disabled-state van de clear-knop blijft (`doneCount === 0` → niet activeerbaar).
  - Reset-state ook wissen in de bestaande `watch(activeListId, …)`.
- [x] **B3** `src/styles.css`:
  - `.is-armed`-varianten voor `.item-delete-button` en `.clear-button` (oranje bg, wit,
    `border-radius` gelijk aan de andere knoppen);
  - `transition` zodat de activatie zichtbaar is zonder te knipperen;
  - `:focus-visible`-outline behouden (a11y gaat niet verloren).
- [x] **B4** Handmatig testen: item verwijderen (1× → oranje, 2× → weg),
      clear-knop (0 afgevinkt → uitgeschakeld; 1× → oranje; 2× → items weg),
      **na 5 s** zonder tweede klik → automatisch hersteld (geen click nodig),
      ESC, tab-wissel, en dat het armen van een andere knop het eerste item herstelt
      (**slechts één knop armed tegelijk**).

  **Bevestigd door de gebruiker: "dit werkt als gewenst".**

---

## Fase C — Laadscherm (`SplashView.vue`)

- [x] **C1** `src/components/SplashView.vue` aanmaken:
  - `<section class="loading-screen" aria-busy="true" role="status">`;
  - apptitel **`Lijstjes`** in dezelfde stijl als `LoginView`/overzicht
    (`font-family: "Playfair Display"`, `h1`-grootte) **met een oranje horizontale streep eronder**,
    identiek aan de titelstreep op de detailpagina (`.list-title-row span`, `var(--orange)`);
  - **spinner rechtsonder**: `position: fixed; right: 24px; bottom: 24px;` met de bestaande
    `@keyframes spin` en de oranje kleuren uit het palet;
  - visueel verborgen tekst `Laden…` voor screenreaders.

  **Uitgevoerd:** `src/components/SplashView.vue` (statisch, geen state). In de
  browser gemeten: Playfair 42px, `line-height: 1.1` (46,2px → de 'j' blijft heel),
  streep 46×3px in `var(--orange)`, `role="status"` + `aria-busy`, visueel verborgen
  `<span class="visually-hidden">Laden…`.

- [x] **C2** Niet scrollbaar: `position: fixed; inset: 0; height: 100dvh; overflow: hidden;`
      (`100vh` als fallback), achtergrondkleur gelijk aan de app-achtergrond. Tijdens het tonen van
      het laadscherm ook `document.body` niet laten scrollen (klasse op `<body>` of `overflow: hidden`).

  **Uitgevoerd:** `.loading-screen` fixed/inset:0/`100dvh` (fallback `100vh`)/overflow
  hidden, achtergrond `var(--paper)`. App.vue toggelt `body.no-scroll` zolang
  `showSplash` waar is (`watch(..., { immediate: true })` — anders wordt de klasse
  bij de eerste waarde nooit gezet).

- [x] **C3** `App.vue` koppelen:
  - `!initialized` → `<SplashView />` (vervangt het huidige `Bezig met laden…`-blok);
  - **ook** tonen zolang de eerste `hydrate(userId)` van een ingelogde gebruiker loopt,
    zodat het overzicht niet eerst leeg flitst; met een **maximumwachttijd van 3 s** als vangnet
    (daarna het overzicht tonen, ook als de server traag is);
  - auth blijft op de achtergrond: `getSession()` → `onAuthStateChange` (bestaande logiek).

  **Uitgevoerd:**
  - `useAuth.init()` zet `initialized` niet langer meteen op `true`, maar pas zodra
    `getSession()` geantwoord heeft (in `finally`), zodat de splash tijdens de
    sessiebepaling dekt. Daarvoor flitste de splash 0 frames: `getSession()` zonder
    sessie is puur lokaal en resolved binnen een microtask.
  - Daarnaast een minimumtoonduur van 400 ms (`minSplashDone`): §8.7 eist "altijd
    eerst het laadscherm, ook als de sessie meteen bekend is".
  - `hydrating`-ref + `beginHydrate()`: splash blijft staan tot `hydrate()` klaar is,
    met 3 s-vangnet (`setTimeout`), en `stopHydrating()` bij uitloggen/unmount.

- [x] **C4** `src/styles.css`: blok `.loading-screen` (+ `.loading-title`, `.loading-rule`,
      `.loading-spinner`). Bestaande `--orange`, `--paper`, `@keyframes spin` hergebruiken;
      `@media (prefers-reduced-motion: reduce)` → pulsesnelheid verlagen of spinner statisch.

  **Uitgevoerd:** blok onderaan `styles.css`; `@keyframes spin` hergebruikt;
  `prefers-reduced-motion: reduce` → `animation: none`. Headless gemeten: titel,
  streep en spinner kloppen (zie C1), splash dekt 844px (100dvh), niet scrollbaar,
  body-lock gaat aan én weer uit.

- [x] **C5** Handmatig testen: bij herstart is direct het laadscherm zichtbaar, niet scrollbaar
      (lang content/klein scherm), spinner rechtsonder, titel + oranje streep identiek aan de
      detailpagina; niet ingelogd → daarna inlogpagina, wel ingelogd → daarna overzicht.

  **Bevestigd door de gebruiker** ("gedrag is goed zo"), met één stijl-aanpassing:
  de oranje streep staat nu links uitgelijnd met de titel (zelfde afmeting 46×3px);
  de titel blijft gecentreerd. Headless gemeten: `rule.left == title.left`.

---

## Fase D — Foutmelding synchronisatie

- [x] **D1** **Oorzaak vaststellen vóór de fix** (geen gok):
  - DevTools → netwerk **offline** zetten en een wijziging doen;
  - console/logs en de `sync-error`-container bekijken;
  - vastleggen waar de `TypeError` ontstaat (kandidaat: `flushOutbox`/`runFlush` in
    `useSync.ts` dat een rejectie niet afvangt, of een niet-string `error.message` uit
    `lib/sync.ts`). Bevinding terugkoppelen vóór implementatie.

  **Bevinding (gereproduceerd met een memory-backend + fake client die een
  `TypeError("Failed to fetch")` gooit):** `applyEntry` had geen `try/catch`;
  postgrest-js gooit bij een netwerkfout i.p.v. `{ error }` terug te geven. De
  rejectie liep door `flushOutbox` → `runFlush` → `void runFlush()` (unhandled).
  Gevolgen: `flushing` bleef `true`, `status` bleef hangen op `syncing`, en de
  outbox-entry kreeg geen `attempts+1` (geen backoff-groei).

- [x] **D2** `src/lib/sync.ts`: `flushOutbox` **mag nooit rejecten**:
  - `applyEntry` aanvullen met `try/catch` en gewone fouten omzetten naar
    `{ ok: false, error: <NL-tekst> }` (net als bij een Supabase-fout);
  - `lastError` altijd een **string** (geen `Error`, geen object, geen `undefined`).

  **Uitgevoerd:** `applyEntry` in `try/catch`; zowel gegooid als geretourneerd
  (`res.error`) wordt door `toUserFacingError` gemapt. `flushOutbox` geeft nu ALTIJD
  een `FlushResult` terug; de loadQueue/saveQueue-foutpadteller (`attempts+1`,
  `lastError`) blijft de backoff aandrijven. Geverifieerd met het repro-script:
  na een `TypeError` komt `{ ok: false, error: "Geen verbinding met de server.
Probeer het opnieuw." }` terug en staat de entry met `attempts: 1` in de outbox.

- [x] **D3** `src/composables/useSync.ts`:
  - `runFlush` omwikkelen in `try/catch/finally`, zodat `flushing` altijd false wordt en
    `status` nooit blijft hangen op `syncing`;
  - bij een onverwerkte fout: `status = "error"` + NL-fallbacktekst, en de retry/backoff blijft
    werken;
  - ontbrekende `supabase` ( niet geconfigureerd ) geeft `synced` zonder foutmelding.

  **Uitgevoerd:** `runFlush` in `try/catch/finally`; success-pad en fout-pad delen
  `scheduleRetry(attempts)` (backoff op hoogste attempt-teller +1); catch zet
  `lastError` via `toUserFacingError` en forceert `status = "error"` (géén
  refreshStatus daarna, die zou de status op basis van de ongemuteerde outbox
  terug kunnen zetten op "pending"). Zonder `supabase` blijft runFlush vroeg
  returnen → status blijft `synced`.

- [x] **D4** Nieuwe mapper `src/lib/errorMessages.ts` (of uitbreiding van `src/lib/utils.ts`):
      `toUserFacingError(error: unknown): string` die:
  - `TypeError` / `Failed to fetch` / netwerkfouten → `Geen verbinding met de server. Probeer het opnieuw.`
  - timeouts/abort → `De verbinding viel weg. Probeer het opnieuw.`
  - RLS/permission → `Geen toegang tot deze gegevens.`
  - duplicate/unique → `Dit item bestaat al.`
  - overig/onbekend → **`Synchronisatie mislukt. Probeer het opnieuw.`**
  - nooit `err.message` van onbekende typen rechtstreeks tonen;
  - details (dev only, `import.meta.env.DEV`) naar `console.warn`, niet naar de UI
    (AGENTS.md: geen `console.log` in productiecode).

  **Uitgevoerd:** `toUserFacingError` is nu de sync-mapper (TypeError-check +
  netwerk/timeout/abort/permissie/duplicaat-regels, fallback
  `Synchronisatie mislukt. Probeer het opnieuw.` — voor auth blijft de eigen
  fallback `Er ging iets mis. Probeer het opnieuw.`). Hele matrix headless
  gecontroleerd (TypeError, netwerk, timeout, AbortError, RLS-code 42501,
  duplicaat-code 23505, onbekend, null → allemaal correct NL). Ruwe foutteksten
  worden nooit getoond.

- [x] **D5** `src/components/SyncIndicator.vue`:
  - `labels.error` → **`Fout bij synchroniseren`**;
  - **geen tekst onder de pill**: de foutregels `p.sync-error` en `ul.sync-failures` bestaan
    niet (meer) — de status is alleen zichtbaar via de pill zelf;
  - de **bestaande inklaplogica** (`COLLAPSE_AFTER_MS`, `.sync-row.is-collapsed`,
    `.is-collapsed` op de timer) uitbreiden zodat deze ook geldt voor status `error`
    (en niet alleen `synced`): na 1,5 s blijft alleen de **rode dot** over. Zelfde watch/timer-code,
    geen tweede implementatie;
  - `aria-live="polite"` op de pill zodat statuswissels (ook inklappen) voorgelezen worden;
  - de `aria-label` bevat status + actie + laatste sync-tijdstip (ongewijzigd).

  **Uitgevoerd:** dezelfde `watch(status, …)`/`COLLAPSE_AFTER_MS`-timer geldt nu voor
  `synced` én `error`. `p.sync-error`/`ul.sync-failures` zijn volledig verwijderd
  (template + `.sync-error`/`.sync-failures`-CSS + `opLabel`/`truncate`/`errorText` —
  er komt dus nooit tekst onder de pill, ook niet tijdelijk vóór het inklappen);
  `aria-live="polite"` op het `.sync-indicator`-containerblok. De NL-mapping van
  fouten gebeurt altijd al in `runFlush` (`toUserFacingError`), dus de pill toont
  nooit een ruwe `TypeError`. AGENTS.md §7.4 hierop aangepast (bewuste keuze van de
  gebruiker: geen foutmeldingen in de UI).

- [x] **D6** Handmatig testen: offline wijzigen → pill wordt rood met `Fout bij synchroniseren` (álleen de pill, geen tekst eronder, géén `TypeError`); na 1,5 s alleen de rode dot; 'Probeer opnieuw' werkt; terug online → `Gesynchroniseerd`.

  **Tussentijdse bevinding + opgelost:** tijdens de D6-test bleef de pill op de spinner hangen
  wanneer de browser-request na netwerkuitval níet snel faalde maar bleef hangen (gedrag van
  Firefox-offline). Na een refresh stond de fout er wél (de entry was immers gemarkeerd). Oorzaak:
  `applyEntry` had geen timeout — een hangende fetch blokkeerde `flushOutbox` → `runFlush` voor
  altijd (`flushing` bleef `true`, `status` bleef `syncing`; alle volgende flushes returnen vroeg
  door de guard). **Fix (D2-vervolg):** `REQUEST_TIMEOUT_MS` (10 s) + `withTimeout(...)` om
  `applyEntry` (per outbox-operatie) én `pullListsFromServer` gewikkeld; na een timeout wordt de
  entry gemarkeerd (`attempts+1`) met `De verbinding viel weg. Probeer het opnieuw.` en gaat de
  backoff-cyclus gewoon door. Headless geverifieerd met een nooit-antwoordende client: zowel
  `flushOutbox` (entry in de outbox) als `pullListsFromServer` geven na ~10 s terug met NL-tekst
  i.p.v. oneindig te hangen; het snelle `TypeError`-pad ("Geen verbinding met de server.…") blijft
  ongewijzigd werken.

  **Vervolg (retest D6):** de gebruiker zag na die fix nóg een spinner tot ~10 s bij een hangende
  Firefox-offline request (en in de backoff-cyclus elke ronde opnieuw) — dat voelt als "blijft
  hangen". Extra fix: **`navigator.onLine`-fast-path** in `useSync.ts`. Zodra het netwerk wegvalt
  (`offline`-event) of bij een flush terwijl `navigator.onLine === false`, gaat de pill **meteen**
  naar `error` ("Fout bij synchroniseren") zonder ook maar één request te doen; `offlineMode`
  voorkomt dat `refreshStatus()` terugvalt naar `pending`/`synced`. Het `online`-event zet
  `offlineMode` uit, ruimt de retry-timer op en flusht automatisch opnieuw. De 10 s-timeout in
  `applyEntry`/`pullListsFromServer` blijft als vangnet voor het geval `navigator.onLine` tóch
  `true` is terwijl de server onbereikbaar is. Browser-geverifieerd: `setOffline(true)` → status
  wordt `error` (instant); chromium én Firefox DevTools 'Offline' zetten `navigator.onLine` op
  `false`.

  **Akkoord gebruiker (retest D6):** "Ja, werkt nu goed" — pill wordt direct rood bij offline,
  geen spinner-hang; terug online → `Gesynchroniseerd`. **Fase D afgerond.**

---

## Fase E — Accountmenu (`HomeView.vue`)

- [x] **E1** Volgorde in de `.account-panel` wordt exact:
  1. `+ Nieuw lijstje`
  2. `Account` (label/eyebrow)
  3. `<email>` van de ingelogde gebruiker
  4. `Uitloggen`

  **Uitgevoerd + styling na feedback gebruiker:** `+ Nieuw lijstje` staat nu bovenaan, daarna het
  `Account`-eyebrow, de e-mail en `Uitloggen`. Op verzoek van de gebruiker: meer ruimte + subtiele
  `border-top` tussen `+ Nieuw lijstje` en `Account` (`.panel-header`); e-mail en Uitloggen beide
  op 10px (`.panel-logout` klasse); minder ruimte tussen e-mail en Uitloggen (`padding-bottom`
  10px→4px op `.current-user-email`); hover-effect op de menuknoppen (oranje-soft achtergrond +
  donkeroranje tekst). Akkoord gebruiker: "Ziet er goed uit".

- [x] **E2** Accountknop `.icon-button` krijgt `:class="{ 'is-active': accountOpen }"` en
      `aria-expanded` (staat al) + `aria-controls="account-panel"`.
- [x] **E3** `src/styles.css`:
  - `.icon-button.is-active { background: var(--orange); color: #fff; }` (oranje zolang het menu
    open is) en **herstel** naar de normale stijl zodra het menu sluit;
  - **Android-blauwe tapflash wegwerken** op alle knoppen:
    `-webkit-tap-highlight-color: transparent;` + `touch-action: manipulation;`
    (dit is de bekende blauwe "ink"-flash op Capacitor/Android);
  - focus zichtbaar houden via `:focus-visible` (geen `outline: none`).
    Alle `outline: 0`-regels in `styles.css` staan op inputs; knoppen hebben al
    `:focus`/`:focus-visible`-stijlen — gecontroleerd.
- [x] **E4** Toegankelijkheid/gedrag: ESC sluit het menu, focus gaat terug naar de accountknop,
      klik buiten sluit (bestaande `onDocumentClick` blijft), `hidden`-logica blijft.
      ESC via `onDocumentKeydown` (geregistreerd/opgeruimd met `onMounted`/`onBeforeUnmount`),
      `accountButtonRef` voor focus-terugkeer.

---

## Fase F — Visuele fixes

- [x] **F1** **Titelmarge overzichtspagina**: 'Mijn lijstjes' mist onderaan de 'j' doordat
      `h1 { line-height: 1 }` de descender afsnijdt. Oplossing: `line-height` voor de overzichtstitel
      verhogen (bv. `1.12`) en/of `padding-bottom` toevoegen, **zodat `letter-spacing: -0.04em` en de
      `.below-title`-positie intact blijven**. Controleer ook de mobiele breakpoint (`h1 { font-size: 36px }`).

  **Uitgevoerd:** `h1 { line-height: 1.12 }` (globaal; geldt ook voor de 'Lijstjes'-titels op
  login/registratie/herstel). Mobiel (36px) → 40.32px lijndoog, niets geknipt (`scrollHeight` =
  `clientHeight`); eyebrow `OVERZICHT` staat eronder. Browser-geverifieerd op 520px en via
  `document.fonts.ready`.

  **Aanvulling na feedback gebruiker:** in Firefox viel de onderkant van de 'j' nog achter de
  eyebrow (diepere descender-rendering of fallback-font). Op suggestie van de gebruiker: de
  bovenmarge van `.below-title` verwijderd (`margin: 0`) en in plaats daarvan
  `padding-bottom: 9px` op `.topbar-title h1` — dat vergroot de clipgrens van `overflow: hidden`
  (clip = padding-box), zodat een descender tot ~9px onder de contentbox zichtbaar blijft en nooit
  achter de eyebrow valt. Positie van de eyebrow blijft identiek (gemeten).

- [x] **F2** **Checkboxes vierkant met afgeronde hoeken**: in `src/styles.css` staat
      `.check-button { border-radius: 50% }` (en een tweede, latere override op 20×20 px).
      Zet beide op een vierkante vorm met afgeronde hoeken (zelfde radius als de andere kleine
      knoppen op de rij, bv. `8px`), behoud de 20×20-omvang, het oranje vinkje en de
      `transition`; controleer de `completed`-stijl.

  **Uitgevoerd:** beide `.check-button`-regels op `border-radius: 8px` + `transition: 0.18s`;
  eindgrootte 20×20, `completed` → oranje achtergrond/border + zichtbaar vinkje.
  Browser-geverifieerd (20×20, radius 8px, oranje completed-staat, transition 0.18s).
  **Na feedback gebruiker:** radius verkleind van 8px naar **5px** (~2/3), op beide regels;
  browser-geverifieerd (gecomputeerde radius 5px).

- [x] **F3** **Inlogpagina**: zie A5 (knop + tekst weg, rest behouden).
      **Gecontroleerd:** `LoginView.vue` bevat alleen e-mail, wachtwoord, `Inloggen` en
      `Wachtwoord vergeten?` — geen registratieknop, geen bevestigingstekst, geen uitnodigingshint
      (A5.1–A5.3 waren al afgerond).

---

## Fase G — Vitest

- [x] **G1** Installeren: `npm i -D vitest @vue/test-utils jsdom`. **GEEN** andere test-runner.
      Geïnstalleerd: `vitest@^5.0.3` (ondersteunt Vite 8, gecheckt via npm peer-deps),
      `@vue/test-utils@^2.5.1`, `jsdom@^30.1.2`.
- [x] **G2** `vite.config.ts`: `/// <reference types="vitest/config" />` en
      `test: { environment: "jsdom", include: ["src/**/*.spec.ts"], restoreMocks: true }`.
      Type-definitie komt uit het type-only import, dus geen los `types`-regel nodig
      (voorkomt conflicten met `tsconfig.app.json`).
- [x] **G3** `package.json`:
      `"test": "vitest run"`, `"test:watch": "vitest"` toegevoegd;
      `"build"` blijft `vue-tsc -b && vite build` (de spec-bestanden worden door
      `vue-tsc -b` strikt meegetypecheckt — staat zo in de build-command en is groen).
- [x] **G4** Testschrijven (bestanden naast de code: `*.spec.ts`) — **11 spec-files, 65 tests**:
  - `src/composables/useArmedConfirm.spec.ts` (8): armt bij 1e klik, voert uit bij 2e klik,
    herstelt na **5 s** (fake timers), **slechts één armed tegelijk**, `disarm()`, herstel na
    `onConfirm`, ESC, `visibilitychange` hiding, `dispose()` verwijdert listeners.
  - `src/lib/errorMessages.spec.ts` (13): `TypeError`/`Failed to fetch`/onbekend → NL-fallback,
    abort/timeout, RLS/permission, duplicaat/23505, nooit de ruwe melding; `toAuthErrorMessage`
    incl. `no_active_invite`.
  - `src/components/SyncIndicator.spec.ts` (6, via `vi.mock` van `useSync` + hoisted holder):
    label `Fout bij synchroniseren` + rode dot zichtbaar bij niet-ingeklapte foutstatus,
    inklap na 1,5 s (**zelfde** timer voor `synced` én `error`), spinner + disabled bij
    `syncing`, aria-label `Probeer opnieuw`, klik roept `syncNow` aan. Let op: de
    zichtbaarheid van het label is CSS-gedreven (`.is-collapsed`); jsdom laadt `styles.css`
    niet, dus de test legt de class-vast (de component-norm).
  - `src/components/SplashView.spec.ts` (3): titel `Lijstjes`, oranje streep, spinner,
    `role="status"` + `aria-busy`, visueel verborgen `Laden…`.
  - `src/components/RegisterView.spec.ts` (5, met `vi.mock("../lib/supabase")`):
    ongeldig token → NL-melding en **geen** `signUp`/`rpc`; geldig token → e-mail ingevuld
    (readonly) en `signUp` met dát adres; wachtwoorden verschillend → inline fout;
    wachtwoord < 6 → inline fout; `no_active_invite` → NL-melding.
  - `src/composables/useAuth.spec.ts` (8): `acceptInvite` roept eerst `claim_invite` aan
    (invocatie-volgorde gecheckt), email-mismatch geweigerd (case/trim-insensitief),
    te kort wachtwoord, `no_active_invite` → NL, géén open `signUp` in de API, plus
    A2-init tests (sessie → user; failing `getSession` → `initialized` blijft `true`).
  - `src/composables/useDeepLink.spec.ts` (6): parser accepteert
    `com.lijstjes.app://invite?token=ABC`, `?invite=ABC` en `#invite=ABC`; URL zonder token
    → `null`; `scrubInviteToken` haalt de token uit de resultaat-URL; `token=` zonder
    invite-pad wordt niet geaccepteerd.
  - `src/components/LoginView.spec.ts` (2): géén registratieknop, géén bevestigingstekst en
    géén uitnodigingshint aanwezig.
  - `src/components/HomeView.spec.ts` (3): accountmenu-volgorde (`+ Nieuw lijstje`, `Account`,
    e-mail, `Uitloggen`), de `is-active`-klasse + `aria-expanded`/`aria-controls` op de
    accountknop, menu sluit bij tweede klik.
  - `src/components/ListDetailView.spec.ts` (4): clear-knop disabled bij 0 afgevinkte items
    (leeg én alleen niet-afgevinkte), enabled met afgevinkte items, wapent bij eerste klik
    (`is-armed`, `aria-pressed`, `Bevestigen:`-label).
- [x] **G5** `npm run verify:data` blijft groen (**52 checks**) — regressiecheck op de data-laag.
- [x] **G6** Groeien van de testdekking: alle nieuwe logica uit fase A–F heeft nu een test.
      Specifiek extra: `src/composables/useSync.spec.ts` (5) dekt de **D6-fast-path**
      (`navigator.onLine === false` → instant `error` zonder flushpoging, offline-event →
      `error`, online-event → automatische flush, `markDirty` offline blijft `error` zonder
      hangende spinner) en `useAuth.init()` (A2). F1/F2 zijn puur CSS en hebben geen logica.

**Opmerking (vangnet, geen wijziging):** `useAuth.init()` reject als `getSession()` faalt
(App.vue gebruikt `void init()` → eenmalige unhandled rejection op de console), maar de
`finally` zet `initialized` altijd op `true`, dus het laadscherm blijft nooit hangen. De
init-test legt dat contract vast. Wil je dit later netjes afvangen (catch + dev-only warn,
zoals `flushOutbox` dat doet), dan is dat een kleine losse wijziging buiten fase G.

---

## Poort — Webversie beoordelen

- [ ] **H1** `npm run typecheck`, `npm run build`, `npm run test`, `npm run verify:data` allemaal groen.
- [ ] **H2** Handmatig testen in `npm run dev` (checklist):
  - [ ] registratie via uitnodigingslink (geldig token) → account aangemaakt → overzicht;
        in de browser via `?invite=<token>` (de deep link werkt alleen op het apparaat);
  - [ ] registratie met verlopen/onecht/verkeerd token → NL-melding, geen account;
  - [ ] **zonder token** een account proberen aan te maken → geweigerd;
  - [ ] signup met de anon key op een uitgenodigd e-mailadres zonder token → geweigerd (A1.4);
  - [ ] tweede registratie met hetzelfde token → geweigerd, uitnodiging staat op 'gebruikt';
  - [ ] **cross-user isolatie**: user A uitloggen → user B inloggen → geen data van A;
  - [ ] item verwijderen via dubbele klik (na 5 s hersteld); idem 'Verwijder afgevinkt';
  - [ ] slechts één knop armed tegelijk (ander item armen herstelt het eerste);
  - [ ] laadscherm bij app-start (ook na hard refresh), niet scrollbaar, spinner rechtsonder;
  - [ ] offline sync → `Fout bij synchroniseren`, inklap naar dot, geen `TypeError`;
  - [ ] accountmenu volgorde + oranje actieve knop + geen blauwe flash op Android;
  - [ ] titel 'Mijn lijstjes' niet meer afgeknipt; checkboxen vierkant met afgeronde hoeken;
  - [ ] inlogpagina zonder registratieknop en zonder bevestigingstekst (geen hint).
- [ ] **H3** **Akkoord gebruiker: "webversie ziet er goed uit"** → pas dan verder.
- [ ] **H3a** Device-test van het deep link (kan niet in de browser):
  - [ ] `com.lijstjes.app://invite?token=<echt token>` opent de app op het `RegisterView`;
  - [ ] een link zonder of met een ongeldig token opent de inlogpagina met NL-melding;
  - [ ] de app cold starten via de link (`getLaunchUrl`) én al draaiend (`appUrlOpen`) werken allebei;
  - [ ] `Wachtwoord vergeten?` → herstelmail aanvragen → link opent `ResetPasswordView`;
  - [ ] nieuw wachtwoord instellen werkt en logt daarna in op het overzicht.
  - [ ] Vastleggen of de herstelmail daadwerkelijk aankomt. Zo niet: het vangnet
        (beheerder maakt een nieuw wachtwoord) is dan de route die telt.

---

## Fase H — Android 1.2 + build (GATED)

- [ ] **I1** `android/app/build.gradle`: `versionName "1.2"` en `versionCode 2`.
      **Tevens** `package.json` `version` → `1.2.0` (beide staan op 1.2; besluit genomen).
- [ ] **I2** `npm run build` (typecheck clean) en `npm run android:sync`.
- [ ] **I3** **STOP — wacht op expliciete goedkeuring van de gebruiker** voordat een APK gebouwd
      wordt. `niet` uitvoeren zonder toestemming (AGENTS.md §10.2).
- [ ] **I4** Na akkoord: `./gradlew assembleDebug` (debug-ondertekend met
      `~/.android/debug.keystore`, zie `tasks.md` fase 4), `apksigner verify --print-certs`,
      APK alleen lokaal bewaren (groot bestand, niet in de repo).

---

## Definition of Done (voor elke taak hierboven)

- [ ] Implementatie voldoet aan de bovenstaande acceptatiecriteria.
- [ ] `npm run typecheck` schoon (geen typefouten).
- [ ] `npm run test` groen (vitest) voor gewijde/nieuwe logica.
- [ ] `npm run build` slaagt.
- [ ] `npm run format` toegepast op gewijzigde bestanden; `npm run format:check` schoon.
- [ ] Geen `console.log` in productiecode (dev-only `console.warn` achter `import.meta.env.DEV`
      is toegestaan en wordt becommentarieerd).
- [ ] Toegankelijkheid: focus, `aria-*`, ESC, `focus-visible` — waar relevant gecontroleerd.
- [ ] Cross-user isolatie niet gebroken (geen data van vorige gebruiker).
- [ ] Sync-gedrag onveranderd correct: outbox FIFO, retry/backoff, indicatorstatus.
- [ ] Handmatig getest in de browser (`npm run dev`).
- [ ] Deep link en herstelflow getest **op het Android-apparaat** (A0.7 / A6.7). Deze
      werken niet in een gewone browser en horen daarom bij het apparaat, niet bij `npm run dev`.
- [ ] `dist/`, `www/` en `android/app/src/main/assets/public/` niet handmatig bewerkt.
- [ ] `android/app/src/main/AndroidManifest.xml` alleen aangeraakt voor de intent-filter
      uit A0.3, niets anders gewijzigd.
- [ ] Taakregel in `tasks.md`/`task_02.md` pas op `[x]` **na** succesvolle afronding.

## Besluiten (antwoorden op de openstaande punten)

| #   | Vraag                      | Besluit                                                 | Gevolg in dit plan                                    |
| --- | -------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Uitnodigingsmodel          | **Trigger + `invites`-tabel**                           | SQL-sjabloon staat klaar: `supabase-invites.sql` (A1) |
| 2   | Wachtwoordbeleid           | **6 tekens** (huidige beleid)                           | A3.2 / A3.3                                           |
| 3   | Hervalbaarheid uitnodiging | **Variant A** — éénmalig, **e-mailbevestiging UIT**     | A1.6; A3.6 vervalt (geen resend-knop nodig)           |
| 4   | Verlooptermijn             | **7 dagen** (`expires_at`, per uitnodiging instelbaar)  | `supabase-invites.sql` stap 1 + 6                     |
| 5   | Inlogpagina                | **Geen hint**, regel wordt gewoon verwijderd            | A5.3                                                  |
| 6   | Armed-timer                | **5 s**, en **slechts één knop armed tegelijk**         | B1 / B4                                               |
| 7   | AGENTS.md                  | **Opschonen eerst (taak 1), aanvullen daarna (taak 2)** | Taak 1 + Taak 2                                       |
| 8   | Package-versie             | **Ja**, ook `package.json` op `1.2.0`                   | I1                                                    |
| 9   | Adres van de app           | **Geen webhost**; deep link `com.lijstjes.app://`       | A0 (fase toegevoegd)                                  |
| 10  | Wachtwoord herstellen      | **Blijft**, afgemaakt; **geen eigen SMTP**              | A6 (fase toegevoegd)                                  |

### Uitleg bij punt 3 (achtergrond, voor de volledigheid)

De uitnodiging wordt verbruikt op het moment dat het account wordt aangemaakt. De vraag is
of één token één keer mag worden gebruikt, of dat het binnen de geldigheidsduur (7 dagen)
meerdere pogingen mag doen. Dat hangt vooral af van de Supabase-instelling **e-mailbevestiging**
(`Confirm email`).

**A. E-mailbevestiging UIT** → na `signUp` is de gebruiker direct ingelogd. Het account is
dus meteen echt. Eénmalig is dan prima.

- Voordeel: simpelste en strakste variant. Het token wordt verbruikt, klaar.
- Risico: als het wachtwoord door de validatie van Supabase wordt geweigerd, is het token
  wél al verbruikt. De beheerder moet dan een nieuw token aanmaken. (De eigen validatie op de
  pagina voorkomt dit grotendeels: minimumlengte, wachtwoorden gelijk.)

**B. E-mailbevestiging AAN** → de gebruiker krijgt een mail en moet die openen; pas dán is
het account bruikbaar. Het account bestaat dan alvast (unconfirmed) terwijl het token
al verbruikt is.

- Voordeel: het bevestigt dat de persoon echt bij dat e-mailadres hoort.
- Nadeel: één mislukte of niet-aangekomen mail betekent: account bestaat, maar niemand kan
  inloggen. Je hebt dan óf een knop 'Verstuur opnieuw' nodig (taak A3.6) óf meerdere
  pogingen toestaan.

**C. Meerdere pogingen binnen 7 dagen** (los van A/B).

- Voordeel: de gebruiker kan het gewoon nog een keer proberen; minder beheerwerk voor jou.
- Nadeel: een uitnodiging is dan niet meer echt "persoonlijk" — als de link per ongeluk
  verder gaat, kunnen meerdere accounts op dezelfde uitnodiging ontstaan. Extra regels
  nodig (max. aantal pogingen, of pas een nieuw account toestaan als de mail is bevestigd).

### Besluit: variant A (éénmalig, e-mailbevestiging uit)

Dat is het minst werk voor jou als beheerder: één token, één account, geen mail nodig, geen
resend-knop. De uitnodiging is daarmee echt een persoonlijke toegang. A3.6 vervalt.

| Situatie                                                  | Gedrag                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Correct formulier, geldig token                           | Account aangemaakt, gebruiker **direct ingelogd**, uitnodiging op `gebruikt` |
| Validatie op de pagina faalt (te kort, niet gelijk, leeg) | Niets aangemaakt, **token blijft geldig** — opnieuw proberen mag             |
| Token verlopen (> 7 dagen) of onbekend                    | NL-melding `Deze uitnodiging is ongeldig of verlopen.` Geen account.         |
| `signUp` zonder token                                     | Trigger weigert met `no_active_invite`. Geen account.                        |
| Zelfde token opnieuw gebruiken                            | Geweigerd; beheerder maakt een nieuwe uitnodiging (sjabloon blok 7b)         |

**Restrisico (bewust voor liefde genomen):** als Supabase zelf het wachtwoord weigert ná een
geslaagde formuliervalidatie, is het token wél verbruikt en is een nieuwe uitnodiging nodig.
De pagina valideert daarom met dezelfde regels (min. 6 tekens, wachtwoorden gelijk) zodat dit
nauwelijks optreedt. Vangt de beheerder dit later toch een keer af, dan is één regel in A2.1
voldoende: die Supabase-fout mappen naar `Er ging iets mis, vraag een nieuwe uitnodiging aan.`

**Waarom niet B of C:** B vraagt een SMTP-configuratie en een extra knop, en bevestigen is
overbodig zodra de uitnodiging al naar het echte adres is gemaild. C maakt de uitnodiging
minder persoonlijk: één link kan dan meerdere accounts opleveren, waarvoor een teller of
extra regel nodig is. Tegenvalt de ervaring in de praktijk, dan is B de logische volgende
stap (en C daarna).

### Overige aandachtspunten bij de keuzes

- **Supabase "Allow new users to sign up" moet AAN blijven** (taak A1.1). De trigger is de
  poortwachter; zet je die toggle uit, dan kan niemand meer registreren, ook niet met een
  geldig token. Dat staat als checklist onderaan `supabase-invites.sql`.
- **De claim-stap in het sjabloon** (`invite_claims`, 15 minuten geldig) voorkomt dat iemand
  zonder token een account maakt op een geadresseerd e-mailadres en zo de uitnodiging
  verbrandt. Zonder die stap zou de trigger alleen op het e-mailadres kunnen controleren.
- **7 dagen** is een compromis: lang genoeg om een mail te vinden, kort genoeg dat een
  vergeten uitnodiging niet maandenlang open staat. Per uitnodiging aanpasbaar via de
  `insert` in blok 6 van het sjabloon.

### Uitleg bij punt 9 (geen webhost, wel een deep link)

De app is een Android-app via Capacitor en heeft **geen webadres**. Er wordt dus geen
Vite-build ergens gehost, en er is geen `https://…` dat als "het adres van de app" kan
dienen. Dat maakt de oorspronkelijke formulering in het plan (`https://JOUW-HOST/?invite=`)
onbruikbaar: zo'n link bestaat niet.

De oplossing is een **deep link met een eigen URL-scheme**. Het scheme `com.lijstjes.app`
staat al in `strings.xml` als `custom_url_scheme`. Android opent de app dan op
`com.lijstjes.app://invite?token=ABC`, waarna de app de token uit het intent leest. Supabase
doet hier niets mee: de link wordt door de beheerder in een mail gezet, en de echte
controle gebeurt door de trigger in de database.

Eén consequentie om te accepteren: **de uitnodigingslink werkt alleen op een apparaat waar
de app geïnstalleerd is.** Op een laptop of desktop doet het scheme niets. Wil je de
registratie toch in een browser testen, dan gebruik je tijdens het ontwikkelen de
`?invite=<token>`-variant op `localhost`. Dat is ook de reden dat de web-parser blijft
bestaan naast de deep link.

Let op bij het versturen van de link: WhatsApp, Mail en sommige chatprogramma's zetten
URL's om naar een klikbare kaart. Stuur de link daarom als platte tekst.

### Uitleg bij punt 10 (herstelmail zonder SMTP)

`Wachtwoord vergeten?` stond al in de app en riep `resetPasswordForEmail` aan. Die functie
had echter twee ontbrekende schakels: er stond geen `redirectTo` bij, dus de link in de mail
wezen nergens heen; en er bestond geen view die een nieuw wachtwoord kon instellen. De
functie was dus al kapot, alleen nog niet merkbaar geweest.

Het besluit is om de flow af te maken in plaats van de knop weg te halen, met één
onmiskenbare beperking: **zonder eigen SMTP-provider verstuurt Supabase de herstelmail met
standaardaflevering.** Dat heeft een harde limiet (enkele mails per uur) en een hoge kans op
spam. De flow is dus correct gebouwd, maar de mail kan uitblijven of in de prullenbak
belanden. Dat is niet op te lossen zonder een mailer.

Daarom is het vangnet expliciet onderdeel van het ontwerp: wie zijn wachtwoord kwijt is en
geen mail ontvangt, vraagt de beheerder om een nieuw wachtwoord. Bij een app zonder webhost
en zonder mailer is dat de route die altijd werkt.

Wat er níét in de UI komt: termen als "rate limit", "SMTP" of "e-mailprovider". De melding
zegt alleen wat de gebruiker kan doen.

## Niet doen

- Geen open `signUp` in de client achterlaten (ook niet "alleen" in `useAuth`).
- De uitnodigingstoken niet in de URL laten staan, loggen of in localStorage bewaren.
- Geen `window.confirm`/`<dialog>`-bevestiging gebruiken voor het verwijderen van items —
  het gevraagde gedrag is expliciet een **twee-staps knop**.
- De `TypeError` niet "verbergen" door de container te verbergen terwijl de fout in de data
  blijft staan: de fout wordt afgehandeld én gemapt (§D2–D4).
- Geen APK bouwen zonder expliciete goedkeuring.
- Geen andere bestanden wijzigen dan die nodig zijn voor deze taken; `AGENTS.md` pas wijzigen
  in taak 1 (opschonen) en taak 2 (nieuwe regels).
- Geen webhost gaan opzetten om de uitnodigingslink te werk krijgen: dat is precies wat
  de deep link (`com.lijstjes.app://`) overbodig maakt (A0).
- Geen SMTP-provider instellen om de herstelmail "beter" te maken. Dat is een bewust
  besluit; de beperking is in A6 en in `supabase-invites.sql` vastgelegd, inclusief het
  vangnet via de beheerder.
- Geen belofte in de UI dat de herstelmail altijd aankomt; de aflevering is beperkt (A6.6).
- De SQL in `supabase-invites.sql` is de enige bron voor het uitnodigingsschema: geen
  uitnodigings-SQL (of tabeldefinitie) elders dupliceren, en het bestand niet per ongeluk
  opnieuw uitvoeren met andere waarden zonder het te willen.
