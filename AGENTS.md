# AGENTS.md — Lijstjes

> **Context:** Dit is een vibe-coded applicatie — onoverzichtelijk en met fouten. We gaan dit systematisch verbeteren. Werk altijd volgens deze richtlijnen.

## 1. Doel & werkwijze

- Lees altijd eerst `tasks.md` voordat je begint met implementeren.
- Werk **web-first**: bouw en test eerst in de browser (`npm run dev`). De Android-export gebeurt **alleen** nadat de gebruiker expliciet heeft aangegeven dat de webversie goed is.
- Houd veranderingen klein en testbaar. Eén taak per keer, en zet een taak pas op `[x]` in `tasks.md` nadat deze aantoonbaar is afgerond en getest.
- Dit project gebruikt **TypeScript** strict + **Vue 3 Composition API** met `<script setup>`.

## 2. Techstack

| Onderdeel       | Technologie                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| Frontend        | Vue 3.5+, TypeScript (strict), Composition API (`<script setup lang="ts">`)               |
| Build tool      | [Vite](https://vitejs.dev/)                                                               |
| Backend/Auth/DB | [Supabase](https://supabase.com/) (Auth + Postgres + Row Level Security)                  |
| Mobile          | [Capacitor](https://capacitorjs.com/) Android                                             |
| Stijl           | Gewone CSS (behoud bestaande `styles.css`-stijl en kleurpalet)                            |
| Code kwaliteit  | [Prettier](https://prettier.io/) (moet altijd toegepast worden voor gewijzigde bestanden) |
| Typechecking    | `vue-tsc -b` (strict, project references) — een typefout blokkeert de build               |

## 3. Commando's

| Commando                | Doel                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start Vite dev-server (localhost). Gebruik dit voor webontwikkeling.                                                                                           |
| `npm run build`         | Typecheck (`vue-tsc -b`) + build met Vite. Produceert `dist/`. **Mag niet slagen als er typefouten zijn.**                                                     |
| `npm run typecheck`     | Alleen de typecheck (`vue-tsc -b`), zonder Vite-build.                                                                                                         |
| `npm run preview`       | Preview van de productie-build (`dist/`) lokaal.                                                                                                               |
| `npm run android:sync`  | `npx cap sync android` — kopieert `dist/` naar Android (`webDir: dist`). Alleen gebruiken nadat er een succesvolle build is.                                   |
| `npm run android:build` | `npx cap build android --androidreleasetype APK` — bouwt een APK. **Pas uitvoeren na akkoord van de gebruiker.**                                               |
| `npm run format`        | Voert Prettier uit over de codebase (of alleen gewijzigde bestanden).                                                                                          |
| `npm run format:check`  | Controleert of alles al geformat is (zonder te schrijven).                                                                                                     |
| `npm run verify:data`   | Bundelt en voert `scripts/verify-data-layer.ts` uit: geautomatiseerde checks van de data-laag (per-user isolatie, geen bulk-wipe, FIFO outbox, retry/backoff). |

> **Opmerking:** `npm run android:debug` zoals eerder genoemd is misleidend — `--androidreleasetype APK` bouwt een release-APK. Voor directe debug/installatie op device kun je ook `npx cap run android` gebruiken. Dat wordt in de Android-export runbook behandeld (fase 4).

## 4. Projectstructuur

Gebruik deze mappenboom. Componenten raken **nooit** direct `localStorage` of Supabase aan — alleen via composables/stores.

```text
Lijsten/
├── .env.example        # Template voor env-variabelen (committen)
├── .env                # Lokale secrets (NIET committen)
├── .gitignore
├── AGENTS.md           # Deze file
├── tasks.md            # Takenlijst (één [ ] per regel)
├── index.html          # Vite entry
├── legacy/
│   └── index.html      # Oude (werkende) versie — referentie voor fase 3, daarna opruimen
├── package.json
├── capacitor.config.json # webDir: dist
├── vite.config.ts
├── tsconfig.json       # Project references (app + node)
├── .prettierrc.json
├── public/             # Statische assets
├── scripts/
│   └── verify-data-layer.ts  # Geautomatiseerde fase 2 checks (npm run verify:data)
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── styles.css      # Verplaatst vanuit projectroot (import in main.ts)
│   ├── env.d.ts        # TypeScript env types
│   ├── components/
│   │   ├── LoginView.vue
│   │   ├── HomeView.vue
│   │   ├── ListDetailView.vue
│   │   ├── ConfirmDeleteDialog.vue
│   │   └── ...
│   ├── composables/
│   │   ├── useAuth.ts
│   │   ├── useLists.ts
│   │   ├── useSync.ts
│   │   └── useToast.ts (optioneel)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── database.types.ts   # Centrale Supabase Database types
│   │   ├── storage.ts          # Per-user storage + outbox
│   │   ├── sync.ts             # Offline-first sync logica
│   │   └── utils.ts
│   └── types/
│       ├── app.ts              # Domein types (List, ListItem, etc.)
│       └── sync.ts             # Outbox operation types
├── dist/               # Build output (Vite) — NIET handmatig bewerken
├── www/                # Oude build output (legacy) — NIET handmatig bewerken, wordt verwijderd in fase 4
├── android/            # Capacitor Android project
└── app.js              # Legacy (oude logica) — referentie voor fase 2/3, daarna opruimen
```

## 5. Vue 3 & TypeScript richtlijnen

- **Alleen Composition API** met `<script setup lang="ts">`. Geen Options API, geen `this`.
- Strikt Typescript: `strict: true`, geen `any` tenzij strikt noodzakelijk en goed becommentarieerd. Probeer eerst goede types.
- **TypeScript staat gepind op 5.x** (`typescript@^5.9.3`). `vue-tsc` werkt (nog) niet met TypeScript 7/native. Niet upgraden zónder te controleren dat `vue-tsc -b` blijft werken.
- Geen handmatige DOM-manipulatie (`innerHTML`, `querySelector` buiten waar absoluut nodig voor eenmalige focus). Gebruik Vue reactiviteit.
- **Unidirectionele dataflow:** props omlaag, events omhoog (`emit`).
- Componenten zijn zo klein mogelijk, verantwoordelijk voor presentatie.
- Geen Vue Router nodig (app heeft 3 views: login, home, detail). Schakel tussen views op basis van state (`auth.loggedIn`, `activeListId`).
- Toegankelijkheid: gebruik semantische HTML, `aria-*` waar van toepassing (modal/dialog), focusbeheer in dialogs.
- UI-teksten in het **Nederlands**, identifiers (vars/functies/props) in het **Engels**.
- Gebruik `crypto.randomUUID()` waar mogelijk, met fallback.

## 6. Omgevingsvariabelen

Supabase-config gaat **niet** meer via `window.*`, maar via Vite env vars.

- `.env.example` bevat:
  ```env
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  ```
- `.env` wordt lokaal gebruikt (niet gecommit). Secrets nooit in code.
- `src/env.d.ts` type `import.meta.env` (Vite types).
- `src/lib/supabase.ts` leest uit `import.meta.env.VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`.
- **Regel:** geen CDN `<script src="...supabase-js...">` in `index.html`. Importeer Supabase via `@supabase/supabase-js` (npm dependency). Zo werkt de build offline correct in de Android WebView.

## 7. Data, security & offline-first

### 7.1 Kernprincipes

- **Per-user cache.** Elke `localStorage`-key is **per `userId`**: `lijstjes:data:<userId>`, `lijstjes:queue:<userId>`. **Nooit** een globale key zonder userId. Bij uitloggen wordt alle state van die sessie geleegd.
- **Server als gedeelde bron, client offline-first.** Wijzigingen gaan eerst naar de lokale cache + een operationele outbox (queue). Sync pusht de outbox naar Supabase in order.
- **Nooit bulk-wipe naar server.** `syncToSupabase()` in de oude code deed `DELETE` van alle lijsten van de gebruiker en her-insertte alles — dat is de oorzaak van het cross-user datalek. **Deze destructieve bulk-sync wordt niet overgenomen.** Gebruik per-entiteit operaties (create/update/delete) vanuit de outbox.
- **Defense in depth:** queries filteren **expliciet** op `owner_id = auth.uid()` waar mogelijk, en RLS blijft tweede beveiligingslaag (zoals in `supabase-schema.sql`).
- **Cross-user isolatie:** bij wisselen van gebruiker wordt de cache van de vorige gebruiker nooit gelezen of gemengd. LocalStorage wordt per-user gescheiden.
- **Leeg account na uitloggen:** `lists`, `activeListId`, outbox en alle per-user keys worden gewist bij `signOut()`. Geen voorbeelddata wordt automatisch geladen voor ingelogde gebruikers (zie sectie 8).

### 7.2 Database types

- `src/lib/database.types.ts` definieert het `Database` type voor Supabase (tabellen `lists`, `list_items`, inclusief relaties). Gebruik deze types in alle Supabase-calls (`from<'lists'>`, etc.) voor end-to-end type safety.
- Domeinmodellen (`List`, `ListItem`) in `src/types/app.ts` — gescheiden van DB-shape waar zinvol.

### 7.3 Outbox (operation queue)

- Outbox bevat operations in **FIFO**-volgorde, per user: `type OutboxOp = CreateList | UpdateList | DeleteList | CreateItem | UpdateItem | DeleteItem | ReorderLists | ReorderItems` (discriminated union in `src/types/sync.ts`).
- Elke operatie heeft een unieke `opId`, `timestamp`, en bevat genoeg data om idempotent te kunnen verwerken.
- Sync probeert operations één voor één of in logische batches, handelt fouten netjes af (retry met backoff), markeert failed operations met `error` + `attempts`, en toont deze in de UI (sync-status).
- Bij succesvolle sync wordt de outbox opgeschoond voor voltooide operaties. Lokale state blijft de bron totdat server bevestigt waar nodig.

### 7.4 Sync-indicator (vereist)

De **sync-interface** (`SyncIndicator.vue`) staat **rechtsboven** en is bewust **compact**: een kleine pill, geen blok. Zij staat in zowel het **overzicht** (`HomeView.vue`, naast het account-icoon) als de **detailweergave** (`ListDetailView.vue`, naast de terugknop) — dus op elk scherm op dezelfde plek.

- **Bezig (`syncing`) → alleen een spinner.** Geen tekst, geen kleur, geen tijd. De pill is dan niet klikbaar.
- **Idle (`synced`) → groen**: groene dot + `Gesynchroniseerd`, met het tijdstip van de laatste succesvolle sync er naast.
- **Wachtrijst (`pending`) → geel/amber**: dot + `In wachtrijst` (outbox niet leeg, nog niet verzonden).
- **Fout (`error`) → rood**: dot + `Fout`; de foutmelding en de mislukte operaties staan eronder in leesbare tekst.
- **Tijdstip:** het korte tijdstip staat naast de pill, de volledige NL-tijdstaat in de `title`-tooltip.
- **Actie:** de pill zelf is de knop — `Synchroniseer nu`, of `Probeer opnieuw` wanneer er een fout is (retry van failed operations). De `aria-label` bevat status, actie en het laatste sync-tijdstip.
- **Geen "Verversen"-knop** meer (noch in het accountmenu, noch in de detailheader). De cloud wordt in gehaald bij inloggen/hydrateren en wanneer de gebruiker terugkomt op het tabblad (`visibilitychange` in `App.vue`).

## 8. Functiespecificaties

### 8.1 Voorbeeldlijsten

De oude voorbeeldlijsten (`"Weekend plannen"`, `"Boodschappen"`) worden **volledig verwijderd**. Nieuwe accounts starten **leeg**. Er wordt **geen** automatische seeding gedaan voor ingelogde gebruikers.

### 8.2 Verwijder lijst — knop verplaatst

- De **'verwijder lijst' knop** wordt **verplaatst van de lijstweergave (detail)** naar **het lijstoverzicht (home)**.
- **Per lijst** verschijnt er een **verwijderknop** op elke lijstkaart in het overzicht (`HomeView.vue`).
- **Navigatie:** klikken op de lijstkaart opent de lijst (detail). Klikken op de verwijderknop **mag geen navigatie triggeren** (stop event propagation).
- De oude verwijderknop in de detailheader (`#delete-list-button`) wordt **verwijderd**.

### 8.3 Bevestigingspopup voor verwijderen

Bij klikken op "verwijder lijst" (per kaart) opent een **bevestigingsmodal/dialog** (`ConfirmDeleteDialog.vue`).

**Exacte teksten:**

- Titel/hoofdtekst: **`Voer lijsttitel in om de lijst te verwijderen`** (exact deze zin)
- Label invoerveld: duidelijk, bv. "Lijsttitel"
- Knoppen: "Annuleren" / "Verwijderen"

**Vereisten:**

- Modal is `aria-modal="true"`, focus wordt gevangen, ESC sluit zonder actie, klikken buiten sluit zonder actie (cancel).
- Invoerveld krijgt focus bij openen.
- Validatie: gebruiker moet de **exacte titel** van de lijst invoeren. Vergelijking is **exact en hoofdlettergevoelig**, na `trim()`.
- Bij **succesvolle validatie** wordt de lijst verwijderd. Bij **foutieve invoer** wordt **geen** lijst verwijderd, en er verschijnt een **inline foutmelding** (bv. "Titel komt niet overeen").
- De lijst wordt pas verwijderd na succesvolle validatie (client + outbox → sync). Geen `window.confirm` meer.

### 8.4 Taken: `[ ]` / `[x]` prefix

- Taken krijgen `[ ]` voor de titel om ze tijdens het project af te kunnen kruisen `[x]`.
- Dit geldt **uitsluitend** voor `tasks.md`. Het is **geen** app-feature: de prefix wordt **niet** in de database of item-tekst opgeslagen.
- Een taak wordt **pas** op `[x]` gezet **ná succesvolle voltooiing** (aantoonbaar getest, build/typecheck ok, en functionaliteit werkt). Niet eerder.

### 8.5 Item afvinken

- Na succesvolle voltooiing van een taak wordt deze afgekruist `[x]` in `tasks.md` (documentatie). In de **app** betekent dit: wanneer een item als `done = true` wordt opgeslagen, wordt het visueel weergegeven als afgerond (bestaande stijl behouden: `text-decoration: line-through`, grijs etc.). De app zelf slaat **geen** `[x]` prefix op in de `text` (zie sectie 6 — UI rendert alleen de visuele status).

## 9. Stijl, conventies & kwaliteit

- **Prettier verplicht.** Bij elke wijziging aan bewerkte bestanden Prettier toepassen (`npm run format` of editor-integratie). Geen ongevormatteerde diffs.
- **Geen `console.log`** in productiecode (debug alleen tijdelijk, verwijderen voor commit).
- **Touch targets:** minimaal 44x44px waar praktisch mogelijk (behoud UX).
- **CSS:** hergebruik bestaande stijl waar mogelijk. `styles.css` is verplaatst naar `src/styles.css` en wordt geïmporteerd in `src/main.ts`. Houd dezelfde look & feel. De Google Fonts-link blijft in `index.html` (DM Sans / Playfair Display); in fase 4 de fonts zelf hosten voor volledig offline gebruik op Android.
- **Comments:** alleen waar nodig om complexe logica uit te leggen (niet overbodig).
- **Git:** in **fase 4** wordt `git init` uitgevoerd (indien nog geen repo). Commit per afgeronde taak waar zinvol. `.gitignore` moet `node_modules/`, `dist/`, `.env`, `.DS_Store`, Android build-artifacts etc. bevatten.

## 10. Bouw, output & Android-export (gated)

### 10.1 Build-output directories

- **`dist/`** — productie-build van Vite. Dit wordt de `webDir` voor Capacitor. **NIET handmatig bewerken.**
- **`www/`** — legacy output (van oude `cp`-build). **NIET handmatig bewerken.** Wordt verwijderd in fase 4 (na migratie naar Vite + succesvolle webbuild).
- **`android/app/src/main/assets/public/`** — wordt door Capacitor gesynchroniseerd vanuit `webDir`. **NIET handmatig bewerken.** Alleen via `npx cap sync android` na build.

### 10.2 Android-export (alleen na akkoord)

De Android `.apk` export gebeurt **pas in fase 4**, en **alleen nadat de gebruiker expliciet zegt: "de webversie ziet er goed uit"**. Fase 1–3 zijn **volledig web**.

**Runbook bij export (fase 4):**

1. **Controleer omgeving**
   - `ANDROID_HOME`/`ANDROID_SDK_ROOT` moeten wijzen naar `~/Android/Sdk` (of Gradle vindt SDK via `android/local.properties`). Indien niet aanwezig: maak `android/local.properties` met:
     ```properties
     sdk.dir=/home/martin_legtenberg/Android/Sdk
     ```
   - Controleer SDK: platforms `android-36` (of hoger), build-tools >= 36.0.0 aanwezig.

2. **Build web**
   - `npm run build` (moet slagen, typecheck clean)
   - `npm run preview` kort controleren (optioneel)

3. **Capacitor sync**
   - `npm run android:sync` (of `npx cap sync android`) — kopieert `dist/` naar Android

4. **Keuze signing (dialog met gebruiker)**
   Er is **geen** keystore in het project. Bestaande APK was een **debug-APK** (Android Debug cert). Bij export stel de gebruiker deze keuze voor:
   - **A) Debug-APK (snel, testen)** — gebruikt systeem debug keystore (`~/.android/debug.keystore`). Geschikt voor intern testen/sideload. Kan bestaande debug-geïnstalleerde app overschrijven (zelfde cert).
   - **B) Release-APK (distributie)** — vereist een **eigen keystore**. **Waarschuwing:** als je de keystore kwijt raakt, kun je de app **nooit meer bijwerken** in de Play Store. Vraag gebruiker om keystore-path, alias, wachtwoorden (niet committen).

   > **Belangrijk:** Genereer **geen** keystore automatisch. Vraag de gebruiker actief welke optie en geef bovenstaande waarschuwing.

5. **Bouwen APK**
   - Debug: `npx cap build android --androidreleasetype APK` (of `npx cap run android` voor directe installatie)
   - Release: alleen met geldige `signingConfig` in `android/app/build.gradle` (door gebruiker/config, niet hardcoded committen van secrets). Bij voorkeur via Capacitor flags of externe keystore, nooit plaintext secrets in repo.

6. **Verifieren & artefact**
   - Verifieer APK met `apksigner verify --print-certs <apk>` (optioneel)
   - Het resulterende `.apk` wordt **niet** onnodig in de repo vastgelegd (groot bestand). Alleen lokaal bewaren of volgens instructie van gebruiker. De huidige `Lijstjes.apk` in root wordt **verwijderd** in fase 4.

## 11. Bekende problemen (huidige codebase)

Deze punten zijn gevonden en **moeten** worden opgelost tijdens de migratie:

| Probleem                       | Locatie (oud)             | Oplossing                                                                                                                     |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cross-user datalek             | `app.js:163–165`          | Per-user localStorage keys + nooit bulk-DELETE+reinsert. Uitloggen wist state.                                                |
| Destructieve sync              | `app.js:101–147`          | Outbox met per-entiteit operaties (geen globale `DELETE .eq(owner_id, ...)` gevolgd door mass-insert van volledige snapshot). |
| Geen owner_id filter bij laden | `app.js:153`              | Expliciet `.eq('owner_id', auth.uid())` + RLS blijft controle.                                                                |
| Eén globale STORAGE_KEY        | `app.js:1–2, 59–62`       | Keys: `lijstjes:data:<userId>`, `lijstjes:queue:<userId>`.                                                                    |
| CDN Supabase                   | `legacy/index.html:213`   | Import via npm `@supabase/supabase-js`, Vite bundle (opgelost in fase 1).                                                     |
| `www/` als build (cp)          | `package.json:6` (oud)    | Vite build → `dist/`, `webDir: 'dist'` in `capacitor.config.json` (opgelost in fase 1).                                       |
| Dubbele click-handlers         | `app.js:250–253, 328–333` | Vue event handling (geen globale dubbele listeners).                                                                          |
| `window.confirm`               | `app.js:347–357`          | Eigen `ConfirmDeleteDialog.vue` met titel-validatie (exact).                                                                  |

> `app.js` en `supabase.config.js` staan nog in de projectroot als legacy-referentie voor de regels hierboven. De oude `index.html` staat in `legacy/`. Deze worden opgeruimd zodra fase 3 de app volledig vervangt.

## 12. Definition of Done (per taak)

Een taak is pas afgerond als:

- [ ] Implementatie voldoet aan specificaties hierboven
- [ ] `npm run build` slaagt **zonder typefouten** (`vue-tsc -b` clean)
- [ ] `npm run dev` draait, functionaliteit handmatig getest (web)
- [ ] Prettier toegepast op gewijzigde bestanden
- [ ] Geen `console.log` in productiecode
- [ ] Toegankelijkheid nagekeken waar relevant (focus, aria, ESC)
- [ ] Cross-user isolatie getest (inloggen als user A, uitloggen, inloggen als user B → geen data van A zichtbaar)
- [ ] Sync-behavior correct (outbox, retry, indicator toont juiste status)
- [ ] Taakregel in `tasks.md` is **[x]** gezet (na succesvolle afronding)
- [ ] Code consistent met bestaande stijl en architectuur

## 13. Regels "Niet doen"

- **NIET** handmatig bewerken in `dist/`, `www/`, of `android/app/src/main/assets/public/`.
- **NIET** secrets committen (`.env`, keystores `*.jks`, `*.keystore`, wachtwoorden).
- **NIET** CDN scripts toevoegen (Supabase via npm).
- **NIET** voorbeeldlijsten toevoegen voor ingelogde gebruikers.
- **NIET** destructieve bulk-sync implementeren.
- **NIET** vóór akkoord van de gebruiker Android-builds/exports starten (fase 1–3 = web-only).
- **NIET** `[x]` zetten voordat de taak aantoonbaar af is.
