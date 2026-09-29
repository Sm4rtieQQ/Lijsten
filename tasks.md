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
