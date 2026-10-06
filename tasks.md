# taken — Lijstjes

Voortgang per taak. Zet een taak pas op `[x]` nadat deze aantoonbaar is afgerond en getest (zie AGENTS.md sectie 12).

## Fase 1 — Vue 3 + TypeScript + Vite opzetten

- [x] Vite + Vue 3 + TypeScript initialiseren (strict), `vite.config.ts`, `tsconfig.json`, `index.html` in root
- [x] `vue-tsc` typecheck toevoegen aan `npm run build` (build faalt bij typefouten)
- [x] `.env.example` aanmaken met `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`; bestaande waarden uit `supabase.config.js` naar lokale `.env` verplaatsen
- [x] `supabase-js` als npm dependency toevoegen; CDN `<script>` uit `index.html` verwijderen
- [x] `src/main.ts`, `src/App.vue`, `src/env.d.ts` aanmaken
- [x] `capacitor.config.json`: `webDir` wijzigen van `www` naar `dist`
- [x] `package.json` scripts: `dev`, `build`, `preview`, `format` toevoegen/hernoemen (`android:build` i.p.v. misleidende `android:debug`)
- [x] Bestaande `styles.css` in de Vite build opnemen (import in `main.ts` of `App.vue`), look & feel behouden
- [x] `.gitignore` aanmaken (`node_modules/`, `dist/`, `.env`, Android build-artifacts, `*.jks`, `*.keystore`)

## Fase 2 — Data-isolatie per gebruiker (security-fix)

- [x] `src/lib/database.types.ts`: Supabase `Database` types voor `lists` en `list_items` (+ relaties)
- [x] `src/lib/supabase.ts`: client op `import.meta.env` i.p.v. `window.*` (getypt met `Database`)
- [x] `src/types/app.ts` en `src/types/sync.ts`: domeintypes + outbox-operaties (discriminated union)
- [x] Per-user `localStorage` keys implementeren: `lijstjes:data:<userId>` en `lijstjes:queue:<userId>` (geen globale key)
- [x] `signOut()` wist alle state: `lists`, `activeListId`, outbox, per-user keys
- [x] Cross-user datalek oplossen: bij wisselen van gebruiker nooit cache van vorige gebruiker lezen/mengen
- [x] Laden van lijsten filtert **expliciet** op `owner_id = auth.uid()` (RLS blijft tweede laag)
- [x] Destructieve bulk-sync (`DELETE` alles + her-insert) verwijderen en vervangen door **outbox met per-entiteit operaties**
- [x] Uitloggen-wachtrij: failed operaties met `error` + `attempts` bijhouden, retry met backoff onderbouwen
- [x] `npm run verify:data` (`scripts/verify-data-layer.ts`): geautomatiseerde checks voor per-user isolatie, geen bulk-wipe, FIFO outbox, retry/backoff, reorder-operaties en titelvalidatie (52 checks groen)
- [ ] Supabase RLS-beleid in `supabase-schema.sql` verifiëren/aanvullen — **schema is bijgewerkt** (gesplitste policies per operatie, `position`-kolom op `lists`, indexen); **nog uitvoeren in de SQL Editor van het Supabase-project**
- [ ] Handleiding testen: inloggen als user A → data aanmaken → uitloggen → inloggen als user B → **geen** data van A zichtbaar; ook bij netwerkfout mag geen data van A getoond worden (vereist browser + 2 accounts; logica al gedekt door `verify:data`)

## Fase 3 — Features (web-only)

- [x] Voorbeeldlijsten (`Weekend plannen`, `Boodschappen`) volledig verwijderen uit de code; nieuwe accounts starten leeg
- [x] Auth-flow (inloggen/registreren/wachtwoord reset/uitloggen) naar Vue-componenten omzetten (`LoginView.vue`)
- [x] Lijstoverzicht (`HomeView.vue`): lijstkaarten + navigatie naar detail
- [x] 'Verwijder lijst'-knop **verplaatsen** van detailweergave naar **het overzicht**, **per lijst** (op elke kaart)
- [x] Klikken op verwijderknop opent modal **zonder** navigatie te triggeren (event propagation stoppen)
- [x] `ConfirmDeleteDialog.vue` bouwen met exacte tekst: `Voer lijsttitel in om de lijst te verwijderen`
- [x] Dialoog: focus in invoerveld bij openen, focus gevangen, ESC sluit zonder actie, klik buiten sluit zonder actie
- [x] Titelvalidatie: exacte, hoofdlettergevoelige vergelijking na `trim()`; bij fout inline foutmelding en **niets verwijderen**
- [x] Bij succesvolle validatie: lijst verwijderen (via outbox/sync) en modal sluiten
- [x] `window.confirm` verwijderen
- [x] Detailweergave (`ListDetailView.vue`): lijsttitel, items, item toevoegen/afvinken/verwijderen, clear completed
- [x] Item afvinken (`done`) → visuele afgerond-status (bestaande CSS: line-through, grijs) behouden
- [x] **Sync-indicator** in detailweergave: status `gesynchroniseerd` / `in wachtrijst` / `fout` (`SyncIndicator.vue`)
- [x] Sync-indicator toont tijdstip van laatste succesvolle sync
- [x] "Synchroniseer nu" / "Probeer opnieuw"-knop om sync (incl. failed operaties) handmatig te triggeren
- [x] Dubbele globale click-handlers (`app.js:250–253, 328–333`) opruimen — Vue event handling
- [x] Drag & drop voor lijsten/items behouden met Vue-events, persistentie via outbox (`list.reorder` / `item.reorder`)
- [x] Detailweergave: lijsttitel **boven** de 'Alle lijstjes'-knop; sync-indicator rechtsboven naast de titel zoals op het overzicht, met inklapgedrag (1,5s → alleen groene dot)
- [x] 'Verwijder afgevinkt' als knop met bezem-icoon en aantal afgevinkte items (`(2)`), zichtbaar zolang er afgevinkte items zijn
- [x] **Fase 3 handmatig testen in de browser** (akkoord gebruiker: "Webversie ziet er goed uit"): nieuwe lijst maken → item toevoegen/afvinken/hernoemen/verwijderen → verwijderknop op kaart (dialoog, foutmelding bij verkeerde titel, ESC/backdrop) → sync-indicator → drag & drop → cross-user test uit fase 2 item 30

## Poort — Webversie beoordelen

- [x] **Akkoord gebruiker: "Webversie ziet er goed uit"** (fase 4 kan beginnen)

## Fase 4 — Android-export (alleen na akkoord)

- [x] Omgeving controleren: `ANDROID_HOME`/`ANDROID_SDK_ROOT` of `android/local.properties` met `sdk.dir=/home/martin_legtenberg/Android/Sdk` (local.properties aangemaakt)
- [x] Controleren SDK: platform `android-36`+, build-tools >= 36.0.0 aanwezig (android-36/36.1, build-tools 36.0.0/36.1.0/37.0.0)
- [x] `npm run build` (typecheck clean) + `npm run preview` korte controle
- [x] **Keuze signing met gebruiker bespreken** (zie AGENTS.md 10.2): debug-APK (snel testen) vs release-APK (eigen keystore, niet kwijtraken!). Geen keystore automatisch genereren — **gebruiker koos debug-APK**
- [x] `npm run android:sync` (`npx cap sync android`) — `dist/` naar Android kopiëren
- [x] APK bouwen: `./gradlew assembleDebug` (debug-ondertekend met `~/.android/debug.keystore`; `--androidreleasetype APK` zou een ongetekende release-APK geven want `build.gradle` heeft geen release signingConfig)
- [x] APK verifiëren met `apksigner verify --print-certs` — `CN=Android Debug` (debug-certificaat)
- [x] `.apk` lokaal bewaren volgens instructie gebruiker (groot bestand, niet in repo): `android/app/build/outputs/apk/debug/app-debug.apk`; bestaande `Lijstjes.apk` in root verwijderd
- [x] Legacy opschonen: `www/`, `legacy/`, `app.js`, `supabase.config.js` en oude `Lijstjes.apk` verwijderd (na succesvolle build); `src/` verwees nergens meer naar deze bestanden
- [ ] `git init` + eerste commit — **gebruiker regelt dit zelf** (geen identiteit ingesteld; op verzoek overgeslagen)
- [x] Prettier config toevoegen/verifiëren en codebase formatteren (`npm run format:check` — alle bestanden al geformat)

## Fase 5 — Uitnodigingsregistratie, dubbele bevestiging, laadscherm, UI-fixes en vitest

> Uitgebreid plan met alle detailschermlijnen staat in [`task_02.md`](task_02.md). Hieronder alleen de voortgang per onderdeel.

- [x] `AGENTS.md` opschonen: verouderde verwijzingen (`android:debug`, `legacy/`, `www/`, `app.js`, `supabase.config.js`, `Lijstjes.apk`) eruit; `supabase-invites.sql` in de projectstructuur; §11 herschreven als lessons learned; `npm run test` als harde eis in §12; alle paden/commando's geverifieerd tegen de repo
- [x] `AGENTS.md` aanvullen met de nieuwe regels: §7.5 foutmeldingen, §7.6 registratie op uitnodiging, §8.6 dubbele bevestiging, §8.7 laadscherm, §8.8 accountmenu, §8.9 inlogpagina, §8.10 titelmarge, §13 "Niet doen"
- [ ] **Fase A — Registratie op uitnodiging** (deel 1 af, zie `task_02.md`):
  - [x] **A0** Deep link: `@capacitor/app` geïnstalleerd, `cap sync android`, tweede `VIEW`/`BROWSABLE` `<intent-filter>` zonder `autoVerify`, `useDeepLink.ts` + `lib/inviteToken.ts` (deep link, `?invite=`, `#invite=`, recovery-link)
  - [x] **A1** types in `database.types.ts` (`invites`, `invite_claims`, `claim_invite`)
  - [x] **A2** `useAuth`: open `signUp` vervangen door `acceptInvite` (claim → email-check → signup), `init()` geëxporteerd, `updatePassword`, `recovery`-ref, `lib/errorMessages.ts` met NL-teksten
  - [x] **A3** `RegisterView.vue` (email readonly, 2 wachtwoordvelden, aria-live melding)
  - [x] **A4** view-keuze zonder router in `App.vue`
  - [x] **A5** `LoginView.vue` zonder registratieknop en zonder uitnodigingstekst
  - [x] **A6** `ResetPasswordView.vue` + `redirectTo: "com.lijstjes.app://"` (zonder SMTP, dus met expliciete aandacht voor de beperkte aflevering)
  - [x] **A1.3** zelf-test `claim_invite('bestaat-niet')` → `valid = false` (bevestigd)
  - [ ] Overgeslagen op verzoek: A1.2 (SQL uitvoeren), A1.4/A1.5 (negatieve/positieve test), A0.7 (deep link op apparaat), A6.7 (herstel-link op apparaat) — blijven open tot fase H
- [x] **Fase B — Dubbele bevestiging bij verwijderen:** `useArmedConfirm.ts` (5s timeout, één knop armed tegelijk), item-verwijderknop en 'Verwijder afgevinkt' in `ListDetailView.vue`; armed-stijl zichtbaar zonder hover; `aria-pressed` + aangepast `aria-label` — **door gebruiker getest en goedgekeurd**
- [x] **Fase C — Laadscherm:** `SplashView.vue` met titel + oranje streep + spinner rechtsonder, `role="status"`/`aria-busy`, niet scrollbaar; `App.vue` toont het bij opstarten en tijdens de eerste `hydrate()` (max. 3s) — afgerond en door gebruiker goedgekeurd (streep links uitgelijnd met de titel)
- [x] **Fase D — Foutmelding synchronisatie:** D1–D5 af: oorzaak gereproduceerd (postgrest-js gooit `TypeError: Failed to fetch` bij netwerkuitval, niets ving het af → `flushing`/`syncing` bleef hangen); `flushOutbox` reject nooit meer, `applyEntry` in `try/catch` + NL-mapper; `runFlush` in `try/catch/finally` met retry/backoff; `errorMessages.ts` (`toUserFacingError` + fallback `Synchronisatie mislukt. Probeer het opnieuw.`); label `Fout bij synchroniseren`; inklappen (1,5s) geldt ook voor `error`; **geen tekst onder de pill** (foutregels verwijderd, op verzoek van de gebruiker). Extra fixes n.a.v. D6-test: hangende requests (Firefox-offline) kunnen de spinner niet meer blokkeren — 10s timeout per server-actie in `applyEntry` en `pullListsFromServer`; en een `navigator.onLine`-fast-path in `useSync.ts` (offline → pill **meteen** rood, `online`-event flusht automatisch opnieuw). **D6 afgerond na hertest gebruiker ("Ja, werkt nu goed")**
- [x] **Fase E — Accountmenu:** volgorde `+ Nieuw lijstje` → `Account` → e-mail → `Uitloggen`, oranje actieve accountknop (`.is-active`), `-webkit-tap-highlight-color: transparent` (geen blauwe tapflash op Android). Aanvullende styling na feedback gebruiker: ruimte + subtiele lijn boven `Account`, e-mail en Uitloggen op 10px, minder ruimte e-mail→Uitloggen, hover-effect op de menuknoppen (oranje-soft). Akkoord gebruiker: "Ziet er goed uit"
- [x] **Fase F — Visuele fixes:** titelmarge `Mijn Lijstjes` (`h1 { line-height: 1.12 }`, descender van de 'j' zichtbaar, ook mobiel; op verzoek van de gebruiker `padding-bottom: 9px` op het h1 i.p.v. de bovenmarge van de eyebrow — Firefox-safe), checkboxes vierkant met afgeronde hoeken (`border-radius: 5px`, beide `.check-button`-regels, ~2/3 van 8px), inlogpagina zonder registratieknop en zonder uitnodigingstekst (gecontroleerd, was al `[x]` via A5). Akkoord gebruiker: "Ziet er goed uit"
- [x] **Fase G — Vitest:** `npm i -D vitest @vue/test-utils jsdom` (vitest 5 + Vite 8 compatibel), `vite.config.ts` testconfig, scripts `test`/`test:watch`, 11 spec-files / 65 tests voor de nieuwe logica (A0/A2/A3/A5/B/D/E; incl. D6-fast-path in `useSync.spec.ts` en `useAuth.init`-vangnet); `npm run verify:data` blijft groen (52 checks). `npm run test` / `test:watch` bestaan nu — de 'let op' in AGENTS.md §3 is bijgewerkt.
- [ ] **Poort — Webversie beoordelen:** handmatig testen in `npm run dev`, daarna akkoord gebruiker ("webversie ziet er goed uit")
- [ ] **Fase H — Android 1.2 + APK (gated):** `versionName "1.2"` + `versionCode 2` in `android/app/build.gradle` **én** `package.json` `1.2.0`; build + `npm run android:sync`; **wachten op expliciete goedkeuring** voor `assembleDebug` (zie AGENTS.md §10.2)
