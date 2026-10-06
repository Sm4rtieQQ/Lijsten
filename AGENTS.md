# AGENTS.md — Lijstjes

> **Context:** Dit is een vibe-coded applicatie — onoverzichtelijk en met fouten. We gaan dit systematisch verbeteren. Werk altijd volgens deze richtlijnen.

## 1. Doel & werkwijze

- Lees altijd eerst `tasks.md` en het actieve planbestand (`task_02.md`) voordat je begint met implementeren.
- Werk **web-first**: bouw en test eerst in de browser (`npm run dev`). De Android-export gebeurt **alleen** nadat de gebruiker expliciet heeft aangegeven dat de webversie goed is.
- Houd veranderingen klein en testbaar. Eén taak per keer, en zet een taak pas op `[x]` nadat deze aantoonbaar is afgerond en getest.
- Nieuwe of gewijzigde **logica hoort getest te worden met vitest** (`npm run test`), naast handmatig testen in de browser.
- Dit project gebruikt **TypeScript** strict + **Vue 3 Composition API** met `<script setup>`.

## 2. Techstack

| Onderdeel       | Technologie                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| Frontend        | Vue 3.5+, TypeScript (strict), Composition API (`<script setup lang="ts">`)               |
| Build tool      | [Vite](https://vitejs.dev/)                                                               |
| Backend/Auth/DB | [Supabase](https://supabase.com/) (Auth + Postgres + Row Level Security)                  |
| Auth            | **Uitnodigingsregistratie** — accounts alleen via een persoonlijke uitnodiging (§7.6)     |
| Mobile          | [Capacitor](https://capacitorjs.com/) Android                                             |
| Stijl           | Gewone CSS (behoud bestaande `styles.css`-stijl en kleurpalet)                            |
| Code kwaliteit  | [Prettier](https://prettier.io/) (moet altijd toegepast worden voor gewijzigde bestanden) |
| Typechecking    | `vue-tsc -b` (strict, project references) — een typefout blokkeert de build               |
| Tests           | [Vitest](https://vitest.dev/) + `@vue/test-utils` + `jsdom` (`npm run test`)              |

## 3. Commando's

| Commando                | Doel                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start Vite dev-server (localhost). Gebruik dit voor webontwikkeling.                                                                                           |
| `npm run build`         | Typecheck (`vue-tsc -b`) + build met Vite. Produceert `dist/`. **Mag niet slagen als er typefouten zijn.**                                                     |
| `npm run typecheck`     | Alleen de typecheck (`vue-tsc -b`), zonder Vite-build.                                                                                                         |
| `npm run test`          | Voert de vitest-tests één keer uit (niet-watch). **Verplicht** voordat een taak op `[x]` mag.                                                                  |
| `npm run test:watch`    | Vitest in watchmodus, voor tijdens het ontwikkelen.                                                                                                            |
| `npm run preview`       | Preview van de productie-build (`dist/`) lokaal.                                                                                                               |
| `npm run verify:data`   | Bundelt en voert `scripts/verify-data-layer.ts` uit: geautomatiseerde checks van de data-laag (per-user isolatie, geen bulk-wipe, FIFO outbox, retry/backoff). |
| `npm run android:sync`  | `npx cap sync android` — kopieert `dist/` naar Android (`webDir: dist`). Alleen gebruiken nadat er een succesvolle build is.                                   |
| `npm run android:build` | `npx cap build android --androidreleasetype APK` — bouwt een **release**-APK. **Pas uitvoeren na akkoord van de gebruiker.**                                   |
| `npm run format`        | Voert Prettier uit over de codebase (of alleen gewijzigde bestanden).                                                                                          |
| `npm run format:check`  | Controleert of alles al geformat is (zonder te schrijken).                                                                                                     |

> **Let op:** `npm run test` en `npm run test:watch` bestaan sinds fase G (vitest + `@vue/test-utils` + `jsdom`, zie `task_02.md`). Spec-bestanden (`*.spec.ts`) staan naast de code en worden door `vue-tsc -b` strikt meegetypecheckt. Zie ook §5: `onMounted` hoort in de component, zodat composables testbaar blijven.

> **Let op bij Android-APK's:** er is geen `npm run android:debug`. Voor een **debug**-APK (snel testen/sideload, ondertekend met het systeem debug keystore) gebruik je `./gradlew assembleDebug` vanuit `android/`, of `npx cap run android` voor directe installatie op een device. `npm run android:build` bouwt een _release_-APK en is zonder geldige `signingConfig` ongetekend. Zie §10.2.

## 4. Projectstructuur

Gebruik deze mappenboom. Componenten raken **nooit** direct `localStorage` of Supabase aan — alleen via composables/stores.

```text
Lijsten/
├── .env.example            # Template voor env-variabelen (committen)
├── .env                    # Lokale secrets (NIET committen)
├── .gitignore
├── .prettierrc.json
├── AGENTS.md               # Deze file
├── tasks.md                # Voortgang fase 1 t/m 4
├── task_02.md              # Actief plan: fase 5 (uitnodiging, dubbele bevestiging, laadscherm, UI-fixes)
├── index.html              # Vite entry (incl. Google Fonts-link)
├── package.json
├── capacitor.config.json   # webDir: dist
├── vite.config.ts          # Vite + vitest config
├── tsconfig.json           # Project references (app + node)
├── tsconfig.app.json
├── tsconfig.node.json
├── supabase-schema.sql     # Schema + RLS voor lists/list_items (idem uitvoerbaar)
├── supabase-invites.sql    # Sjabloon voor uitnodigingsregistratie (tabel + trigger + beheer)
├── scripts/
│   └── verify-data-layer.ts  # Geautomatiseerde fase 2 checks (npm run verify:data)
├── src/
│   ├── App.vue             # View-switching: splash / login / registratie / overzicht / detail
│   ├── main.ts
│   ├── styles.css          # Geïmporteerd in main.ts — alle styling
│   ├── env.d.ts            # TypeScript env types
│   ├── components/
│   │   ├── SplashView.vue        # Laadscherm (staat bij het opstarten)
│   │   ├── LoginView.vue         # Alleen inloggen (geen registratie)
│   │   ├── RegisterView.vue      # Registratie via uitnodiging
│   │   ├── ResetPasswordView.vue # Nieuw wachtwoord na herstel-link
│   │   ├── HomeView.vue          # Lijstoverzicht + accountmenu
│   │   ├── ListDetailView.vue    # Lijstweergave, items, verwijderen
│   │   ├── ConfirmDeleteDialog.vue
│   │   ├── SyncIndicator.vue
│   │   └── *.spec.ts            # Vitest-tests staan naast de code
│   ├── composables/
│   │   ├── useAuth.ts
│   │   ├── useLists.ts
│   │   ├── useSync.ts
│   │   ├── useArmedConfirm.ts    # Twee-staps bevestiging (§8.6)
│   │   ├── useDeepLink.ts        # Deep link + ?invite= (§8.11)
│   │   └── *.spec.ts
│   └── lib/
│       ├── supabase.ts
│       ├── database.types.ts   # Centrale Supabase Database types (incl. claim_invite)
│       ├── inviteToken.ts      # Pure URL-parser voor de uitnodiging (§8.11)
│       ├── storage.ts          # Per-user storage + outbox
│       ├── sync.ts             # Offline-first sync logica
│       ├── errorMessages.ts    # Fout -> leesbare NL-tekst (§7.5)
│       └── utils.ts
├── dist/               # Build output (Vite) — NIET handmatig bewerken
└── android/            # Capacitor Android project
```

> De legacy-bestanden (`legacy/`, `www/`, `app.js`, `supabase.config.js`, `Lijstjes.apk`) zijn in fase 4 verwijderd. `www/` komt nog voor in `.gitignore` en in `tsconfig`-gerelateerde restanten; dat is cosmetisch en mag bij een volgende opschoonronde verdwijnen.

## 5. Vue 3 & TypeScript richtlijnen

- **Alleen Composition API** met `<script setup lang="ts">`. Geen Options API, geen `this`.
- Strikt Typescript: `strict: true`, geen `any` tenzij strikt noodzakelijk en goed becommentarieerd. Probeer eerst goede types.
- **TypeScript staat gepind op 5.x** (`typescript@^5.9.3`). `vue-tsc` werkt (nog) niet met TypeScript 7/native. Niet upgraden zónder te controleren dat `vue-tsc -b` blijft werken.
- Geen handmatige DOM-manipulatie (`innerHTML`, `querySelector` buiten waar absoluut nodig voor eenmalige focus). Gebruik Vue reactiviteit.
- **Unidirectionele dataflow:** props omlaag, events omhoog (`emit`).
- Componenten zijn zo klein mogelijk, verantwoordelijk voor presentatie.
- Geen Vue Router nodig (app heeft vijf views: splash, login, registratie, overzicht en detail). Schakel tussen views op basis van state (`initialized`, `user`, uitnodigingstoken, `activeListId`) in `App.vue`.
- **Composables blijven testbaar:** `onMounted` hoort in de component die ze gebruikt, niet in de composable zelf. `useAuth` exposeert daarom `init()` en `App.vue` roept die aan.
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
- **Uitnodigingen hebben geen env-var nodig**: het token komt uit de link die de beheerder zelf uitdeelt, en de server-side controle gebeurt in Postgres (§7.6).

## 7. Data, security & offline-first

### 7.1 Kernprincipes

- **Per-user cache.** Elke `localStorage`-key is **per `userId`**: `lijstjes:data:<userId>`, `lijstjes:queue:<userId>`. **Nooit** een globale key zonder userId. Bij uitloggen wordt alle state van die sessie geleegd.
- **Server als gedeelde bron, client offline-first.** Wijzigingen gaan eerst naar de lokale cache + een operationele outbox (queue). Sync pusht de outbox naar Supabase in order.
- **Nooit bulk-wipe naar server.** `syncToSupabase()` in de oude code deed `DELETE` van alle lijsten van de gebruiker en her-insertte alles — dat is de oorzaak van het cross-user datalek. **Deze destructieve bulk-sync wordt niet overgenomen.** Gebruik per-entiteit operaties (create/update/delete) vanuit de outbox.
- **Defense in depth:** queries filteren **expliciet** op `owner_id = auth.uid()` waar mogelijk, en RLS blijft tweede beveiligingslaag (zoals in `supabase-schema.sql`).
- **Cross-user isolatie:** bij wisselen van gebruiker wordt de cache van de vorige gebruiker nooit gelezen of gemengd. LocalStorage wordt per-user gescheiden.
- **Leeg account na uitloggen:** `lists`, `activeListId`, outbox en alle per-user keys worden gewist bij `signOut()`. Geen voorbeelddata wordt automatisch geladen voor ingelogde gebruikers (zie sectie 8).

### 7.2 Database types

- `src/lib/database.types.ts` definieert het `Database` type voor Supabase (tabellen `lists`, `list_items`, inclusief relaties; daarnaast de beheertabellen `invites` en `invite_claims` en het retourtype van de functie `claim_invite`). Gebruik deze types in alle Supabase-calls (`from<'lists'>`, etc.) voor end-to-end type safety.
- De beheertabellen `invites` en `invite_claims` staan **in het type** omdat de RPC `claim_invite` ze raakt. De app krijgt daarover **geen** rechten (RLS aan, geen policies, grants ingetrokken); het zijn types, geen toegang.
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
- **Fout (`error`) → rood**: rode dot + `Fout bij synchroniseren`. **Er staat geen tekst onder de pill** — de foutmelding en mislukte operaties worden niet in de UI getoond (bewuste keuze van de gebruiker); de status is alleen zichtbaar via de pill zelf.
- **Inklappen:** na 1,5 seconden stabiele status verdwijnt het tekstlabel en blijft alleen de dot over. Dat geldt **zowel voor `synced` als voor `error`** — dezelfde `COLLAPSE_AFTER_MS`-timer en dezelfde `.sync-row.is-collapsed`-regels, dus één implementatie voor beide statussen. Bij `error` blijft de rode dot staan.
- **Tijdstip:** het korte tijdstip staat naast de pill, de volledige NL-tijdstaat in de `title`-tooltip.
- **Actie:** de pill zelf is de knop — `Synchroniseer nu`, of `Probeer opnieuw` wanneer er een fout is (retry van failed operations). De `aria-label` bevat status, actie en het laatste sync-tijdstip.
- **Geen "Verversen"-knop** meer (noch in het accountmenu, noch in de detailheader). De cloud wordt ingehaald bij inloggen/hydrateren en wanneer de gebruiker terugkomt op het tabblad (`visibilitychange` in `App.vue`).

### 7.5 Foutmeldingen (nooit ruwe fouten tonen)

- **Een `TypeError` of andere technische fout mag nooit zichtbaar zijn voor de gebruiker.**
- **Fouten worden afgehandeld én gemapt:** `src/lib/errorMessages.ts` bevat `toUserFacingError(error: unknown): string`. Bekende gevallen krijgen leesbare NL-tekst (netwerk/timeout, geen toegang door RLS, duplicaat), en **alles onbekends valt terug op `Synchronisatie mislukt. Probeer het opnieuw.`**. Nooit `err.message` van een onbekend type direct tonen.
- `flushOutbox` mag **nooit rejecten**: gewone fouten worden omgezet naar `{ ok: false, error: <NL-tekst> }`, en `lastError` is altijd een **string**.
- `runFlush` in `useSync.ts` staat in `try/catch/finally`, zodat `flushing` altijd vrijkomt, de status nooit blijft hangen op `syncing`, en de retry/backoff blijft werken.
- Details mogen naar `console.warn` **achter `import.meta.env.DEV`**, nooit naar de UI en nooit als `console.log` in productiecode.
- Hetzelfde principe geldt voor auth: de triggerfout `no_active_invite` wordt vertaald naar `Deze uitnodiging is ongeldig of verlopen.`

### 7.6 Registratie op uitnodiging (verplicht)

Er is **géén open registratie**. Alleen uitgenodigde personen kunnen een account aanmaken.

- **Model:** één uitnodiging = één account. Een uitnodiging is **eenmalig** (`used_at`) en verloopt na **7 dagen** (`expires_at`, per uitnodiging instelbaar).
- **Afdwinging gebeurt in de database**, niet in de app: een `before insert on auth.users` trigger in `supabase-invites.sql` weigert elke signup zonder geldige uitnodiging (fout `no_active_invite`). Een token checken in de client is géén beveiliging.
- **De claim-stap is onderdeel van de beveiliging.** De registratiepagina roept `claim_invite(token)` aan voordat ze `signUp` doet. De claim is 15 minuten geldig. Zonder die stap zou iemand zonder token een account kunnen aanmaken op een geadresseerd e-mailadres en zo de uitnodiging verbranden.
- **Beheer:** uitnodigingen worden uitsluitend handmatig gemaakt via de Supabase SQL Editor (`supabase-invites.sql`, blok 6) of het Dashboard. `anon`/`authenticated` hebben **geen** rechten op `invites` en `invite_claims` (RLS aan, geen policies, grants ingetrokken).
- **E-mailbevestiging staat UIT** in Supabase (variant A). Na signup is de gebruiker direct ingelogd; er is dus geen "verstuur opnieuw"-knop.
- **Wachtwoordbeleid:** minimaal **6 tekens** (zoals nu). De pagina valideert met dezelfde regels als Supabase, zodat een afgewezen wachtwoord geen verspilde uitnodiging oplevert.
- **Client-regels:**
  - `supabase.auth.signUp` bestaat alleen in `useAuth.acceptInvite(...)`. Er is **geen** publieke `signUp` meer in de auth-laag.
  - `acceptInvite` roept eerst `claim_invite` aan en daarna pas `signUp`.
  - Het e-mailadres komt uit de uitnodiging en is op de pagina **readonly**; een ander adres wordt geweigerd met `Deze uitnodiging is voor een ander e-mailadres.`
  - De token komt binnen via een **deep link**: `com.lijstjes.app://invite?token=…` (zie §8.11). Voor webtesten bestaan daarnaast `?invite=` en `#invite=`. Daarna wordt de token meteen weggegooid respectievelijk uit de URL verwijderd (`history.replaceState`). Niet loggen, niet in `localStorage` bewaren, niet in foutmeldingen tonen.
- **Supabase-instellingen** (nodig voor het functioneren): Email-provider aan, "Allow new users to sign up" **aan** (de trigger is de poortwachter), "Confirm email" **uit**. Site URL en Redirect URLs staan op **`com.lijstjes.app://`** — het app-schema, **geen** webadres: de app draait als Android-app zonder webhost. De volledige checklist staat onderaan `supabase-invites.sql`.
- **Gevolg voor de beheerder:** een uitnodigingslink is het enige toegangsbewijs. Mail hem uitsluitend naar het echte adres van die persoon, niet in een groepsbericht. Stuur hem als **platte tekst**: WhatsApp en Mail zetten URL's om naar een klikbare kaart. Lukt een registratie toch niet, dan maak je simpelweg een nieuwe uitnodiging.

## 8. Functiespecificaties

### 8.1 Voorbeeldlijsten

De oude voorbeeldlijsten (`"Weekend plannen"`, `"Boodschappen"`) zijn **volledig verwijderd**. Nieuwe accounts starten **leeg**. Er wordt **geen** automatische seeding gedaan voor ingelogde gebruikers.

### 8.2 Verwijder lijst — knop verplaatst

- De **'verwijder lijst' knop** staat **in het lijstoverzicht (home)**, niet in de detailweergave.
- **Per lijst** verschijnt er een **verwijderknop** op elke lijstkaart in het overzicht (`HomeView.vue`).
- **Navigatie:** klikken op de lijstkaart opent de lijst (detail). Klikken op de verwijderknop **mag geen navigatie triggeren** (stop event propagation).
- De oude verwijderknop in de detailheader (`#delete-list-button`) is **verwijderd**.

### 8.3 Bevestigingspopup voor het verwijderen van een lijst

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
- Dit geldt **uitsluitend** voor `tasks.md` en de planbestanden. Het is **geen** app-feature: de prefix wordt **niet** in de database of item-tekst opgeslagen.
- Een taak wordt **pas** op `[x]` gezet **ná succesvolle voltooiing** (aantoonbaar getest, build/typecheck ok, en functionaliteit werkt). Niet eerder.

### 8.5 Item afvinken

- Wanneer een item als `done = true` wordt opgeslagen, wordt het visueel weergegeven als afgerond (bestaande stijl behouden: `text-decoration: line-through`, grijs etc.).
- De app zelf slaat **geen** `[x]` prefix op in de `text` — de UI rendert alleen de visuele status.
- De checkboxes op de detailpagina zijn **vierkant met afgeronde hoeken**, in dezelfde radius-stijl als de andere knoppen in de app (dus **niet** `border-radius: 50%`).

### 8.6 Items verwijderen via dubbele input

Het verwijderen van een item in de detailweergave — en het **'Verwijder afgevinkt'**-knop — gebeurt via **twee klikken**, zonder dialog:

1. **Eerste klik:** de knop wordt **geactiveerd** (armed): achtergrond wordt de oranje kleur, icoon/tekst wit, en de knop krijgt `aria-pressed="true"` met een aangepast `aria-label` (`Bevestigen: …`).
2. **Tweede klik:** pas dan wordt verwijderd.

Regels:

- **Er is altijd maar één knop armed tegelijk.** Het armen van een andere knop herstelt de vorige onmiddellijk.
- **Auto-herstel na 5 seconden** (`ARM_TIMEOUT_MS`) zonder tweede klik: de knop valt terug naar de normale stijl en het woord 'verwijderen' verdwijnt uit de `aria-label` weer.
- Ook herstel bij: ESC, wisselen van lijst (`activeListId`), en wanneer het item uit de lijst verdwijnt. Bij het wisselen van tabblad (`visibilitychange`) eveneens.
- De armed-status moet **zonder hover** zichtbaar zijn (touch schermen kennen geen hover): de verwijderknop op een item mag niet alleen op hover verschijnen.
- De 'Verwijder afgevinkt'-knop blijft **uitgeschakeld** als er niets afgevinkt is.
- De logica zit in één generieke composable: `useArmedConfirm.ts`.
- **Geen** `window.confirm` en **geen** dialog voor deze acties — het gevraagde gedrag is expliciet de twee-staps knop.

### 8.7 Laadscherm (`SplashView.vue`)

- Bij het **opstarten van de applicatie** is altijd eerst het laadscherm zichtbaar, ook als de sessie meteen bekend is.
- **Authentieatie vindt op de achtergrond plaats.** Het laadscherm wacht tot de sessie bekend is; is er een sessie, dan wordt daarna het overzicht getoond, anders de inlogpagina.
- Het laadscherm toont de **apptitel `Lijstjes`** in dezelfde stijl als op de overzichtspagina, met een **oranje horizontale streep eronder**, identiek aan de titelstreep op de detailpagina.
- **Rechtsonderin de pagina** staat een **spinner** zolang het laden duurt (bestaande `@keyframes spin` en het oranje palet hergebruiken).
- Het laadscherm **kan niet scrollen**: `position: fixed; inset: 0; height: 100dvh; overflow: hidden`, met de app-achtergrondkleur.
- Toegankelijkheid: `role="status"`, `aria-busy="true"`, en een visueel verborgen tekst (`Laden…`) zodat de status voorgelezen wordt.
- Het overzicht mag niet eerst leeg flitsen: toon het laadscherm ook tijdens de eerste `hydrate()` van een ingelogde gebruiker, met een **maximumwachttijd van 3 seconden** als vangnet.

### 8.8 Accountmenu

Het accountmenu (`HomeView.vue`) heeft deze **volgorde**, exact:

1. `+ Nieuw lijstje`
2. `Account`
3. `<email>` van de ingelogde gebruiker
4. `Uitloggen`

- De **accountknop wordt oranje** zodra het menu open is, en wordt **hersteld** naar de normale stijl zodra het menu weer sluit (klasse `is-active`).
- **In de Android-app wordt de knop niet blauw bij tikken.** Onderdruk de standaard tap-highlight van het platform: `-webkit-tap-highlight-color: transparent` (en `touch-action: manipulation`) voor knoppen. De focusring blijft zichtbaar via `:focus-visible` — dus nooit `outline: none` zonder alternatief.
- Toegankelijkheid: `aria-expanded` en `aria-controls` op de knop, ESC sluit het menu, focus gaat terug naar de knop, klikken buiten sluit (bestaande `onDocumentClick`).

### 8.9 Inlogpagina

- De inlogpagina (`LoginView.vue`) heeft **alleen** het inlogformulier: e-mail, wachtwoord, `Inloggen` en `Wachtwoord vergoten?`.
- **Geen registratieknop.** Registratie verloopt uitsluitend via de uitnodigingslink (§7.6).
- **Geen tekst** over bevestiging via e-mail en **geen uitnodigingshint**: de regel is verwijderd en komt niet in een andere vorm terug. Wie een account nodig heeft, krijgt de link rechtstreeks van de beheerder.

### 8.10 Overzichtspagina — titel

- De titel `Mijn Lijstjes` mag niet worden afgeknapt: de **onderkant van de 'j' moet zichtbaar blijven**. `h1 { line-height: 1 }` snijt de descender weg, dus de titel heeft een ruimere `line-height` en/of `padding-bottom`.
- Geldt ook op mobiele schermen (de breakpoint verkleint de `font-size`, maar de regel blijft).

### 8.11 Deep link en wachtwoord herstellen

De app draait als **Android-app zonder webhost**. Er is dus geen webadres; de registratie-uitnodiging komt binnen via een deep link met eigen scheme.

- **Scheme:** `com.lijstjes.app`, vastgelegd in `android/app/src/main/res/values/strings.xml` als `custom_url_scheme`. Wijzig dit niet zonder de `AndroidManifest.xml` en de Supabase Site URL mee te wijzigen.
- **Intent-filter:** in `AndroidManifest.xml` een **tweede** `<intent-filter>` in de `<activity>`, met `VIEW` / `DEFAULT` / `BROWSABLE` en `<data android:scheme="@string/custom_url_scheme" />`. **Zonder `android:autoVerify="true"`** — dat geldt alleen voor App Links op een gedomein dat je bezit, en het zou de custom scheme laten falen.
- **Ontvangen:** bij het opstarten `App.getLaunchUrl()` én tijdens het draaien `App.addListener("appUrlOpen", …)`. Beide zijn nodig: de eerste voor een cold start, de tweede als de app al open staat. Ruim de listener op in `onBeforeUnmount`.
- **Registratielink:** `com.lijstjes.app://invite?token=…`. Dit is geen Supabase-redirect; de beheerder plakt de link in een mail en de database-trigger valideert de token.
- **Webvarianten:** `?invite=<token>` en `#invite=<token>` blijven bestaan zodat registratie in `npm run dev` te testen is. De deep link werkt niet in een browser.
- **Gevolg:** de link werkt alleen waar de app geïnstalleerd is. Op een computer doet het scheme niets.
- **Wachtwoord herstellen:** `resetPasswordForEmail(email, { redirectTo: "com.lijstjes.app://" })`. De recovery-sessie komt binnen als intent.
  - **Let op:** `supabase.auth.getSessionFromUrl()` bestaat **niet** als publieke API in de huidige `@supabase/auth-js` (`_getSessionFromURL` is `private`). Omdat `flowType` standaard `implicit` is, zit het tokenpaar in de **hash** van de herstellink. `useDeepLink.handleIncomingUrl` leest die hash zelf en roept de wel publieke `supabase.auth.setSession({ access_token, refresh_token })` aan. Verzin geen cast om de private methode toch aan te roepen.
  - `setSession` vuurt daarna `SIGNED_IN`, **niet** `PASSWORD_RECOVERY`. Daarom zet `useDeepLink` de vlag met `setRecovery(true)` uit `useAuth`, in plaats van op het event te wachten. De `PASSWORD_RECOVERY`-listener blijft als tweede route bestaan voor het geval Supabase de flow zelf afhandelt.
- **Geen SMTP-provider.** Bewust besluit: de herstelmail gaat via de standaardaflevering van Supabase, met een harde limiet van enkele mails per uur en een hoge kans op spam. De mail kan dus uitblijven. Het vangnet is dat de beheerder een nieuw wachtwoord zet. De UI meldt dit zonder technische termen als "rate limit" of "SMTP".

## 9. Stijl, conventies & kwaliteit

- **Prettier verplicht.** Bij elke wijziging aan bewerkte bestanden Prettier toepassen (`npm run format` of editor-integratie). Geen ongevormatteerde diffs.
- **Geen `console.log`** in productiecode (debug alleen tijdelijk, verwijderen voor commit). Dev-only `console.warn` achter `import.meta.env.DEV` is toegestaan en wordt becommentarieerd.
- **Touch targets:** minimaal 44x44px waar praktisch mogelijk (behoud UX).
- **CSS:** hergebruik bestaande stijl waar mogelijk. `styles.css` staat in `src/styles.css` en wordt geïmporteerd in `src/main.ts`. Houd dezelfde look & feel. De Google Fonts-link blijft in `index.html` (DM Sans / Playfair Display); die fonts nog zelf hosten is een openstaande wens voor volledig offline gebruik op Android.
- **Bronvolgorde in `styles.css`:** latere regels met dezelfde selector winnen. Er staan dubbele definities (o.a. `.check-button`); bij het wijzigen van zo'n regel **allebei** aanpassen, anders blijft de oude waarde de baas.
- **Comments:** alleen waar nodig om complexe logica uit te leggen (niet overbodig).
- **Git:** commit per afgeronde taak waar zinvol. `.gitignore` bevat `node_modules/`, `dist/`, `.env`, `.DS_Store`, Android build-artifacts, `*.keystore`, `*.jks` en `*.apk`.

## 10. Bouw, output & Android-export (gated)

### 10.1 Build-output directories

- **`dist/`** — productie-build van Vite. Dit wordt de `webDir` voor Capacitor. **NIET handmatig bewerken.**
- **`android/app/src/main/assets/public/`** — wordt door Capacitor gesynchroniseerd vanuit `webDir`. **NIET handmatig bewerken.** Alleen via `npx cap sync android` na build.
- ~~`www/`~~ — legacy output, **verwijderd** in fase 4. Komt niet meer voor.

### 10.2 Android-export (alleen na akkoord)

De Android `.apk` export gebeurt **alleen nadat de gebruiker expliciet zegt dat de webversie er goed uitziet**. Alle andere fasen zijn **volledig web**.

**Runbook bij export:**

1. **Controleer omgeving**
   - `ANDROID_HOME`/`ANDROID_SDK_ROOT` moeten wijzen naar `~/Android/Sdk`, of Gradle vindt de SDK via `android/local.properties`:
     ```properties
     sdk.dir=/home/martin_legtenberg/Android/Sdk
     ```
   - Vereist: platform `android-36` (of hoger), build-tools >= 36.0.0.

2. **Build web**
   - `npm run test` (groen), `npm run build` (moet slagen, typecheck clean)
   - `npm run preview` kort controleren (optioneel)

3. **Capacitor sync**
   - `npm run android:sync` (of `npx cap sync android`) — kopieert `dist/` naar Android

4. **Keuze signing (dialog met gebruiker)**
   Er is **geen** keystore in het project; de bestaande APK was een **debug-APK** (Android Debug cert). Bij export stel je de gebruiker deze keuze voor:
   - **A) Debug-APK (snel, testen)** — `./gradlew assembleDebug` vanuit `android/`, ondertekend met het systeem debug keystore (`~/.android/debug.keystore`). Kan een bestaande debug-geïnstalleerde app overschrijven (zelfde cert).
   - **B) Release-APK (distributie)** — vereist een **eigen keystore**. **Waarschuwing:** als je de keystore kwijt raakt, kun je de app **nooit meer bijwerken** in de Play Store. Vraag de gebruiker om keystore-path, alias en wachtwoorden (niet committen).

   > **Belangrijk:** genereer **geen** keystore automatisch. Vraag de gebruiker actief welke optie en geef bovenstaande waarschuwing.

5. **Bouwen APK**
   - Debug: `./gradlew assembleDebug` (of `npx cap run android` voor directe installatie op een device).
   - `npm run android:build` (`--androidreleasetype APK`) bouwt een **release**-APK en is zonder geldige `signingConfig` in `android/app/build.gradle` **ongetekend**. Gebruik die dus niet als "debug"-snelknop.
   - Release: alleen met geldige `signingConfig` (nooit plaintext secrets in de repo).

6. **Versienummer**
   - `versionName` en `versionCode` staan in `android/app/build.gradle`; **houd `package.json`'s `version` gelijk** aan de Android-versie (bv. `versionName "1.2"` + `versionCode 2` ↔ `package.json` `1.2.0`).
   - Verhoog het versienummer vlak vóór het bouwen, niet eerder.

7. **Verifieren & artefact**
   - Verifieer met `apksigner verify --print-certs <apk>` (optioneel).
   - Het `.apk` wordt **niet** in de repo vastgelegd (groot bestand, en `*.apk` staat in `.gitignore`). Alleen lokaal bewaren volgens instructie van de gebruiker.

## 11. Lessons learned (niet opnieuw doen)

Deze fouten zijn in de legacy-code gevonden en inmiddels opgelost. De les is blijvend; de bestanden zijn weg.

| Fout (legacy)                                                | Les                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Cross-user datalek via globale `localStorage`-key            | Altijd **per `userId`** scopen: `lijstjes:data:<userId>`, `lijstjes:queue:<userId>`. Bij uitloggen alles van die sessie wissen. |
| Destructieve sync: alles `DELETE` en opnieuw invoegen        | Per-entiteit operaties vanuit de outbox. Nooit een volledige snapshot in bulk wegschrijven.                                     |
| Laden zonder `owner_id`-filter                               | Filter **expliciet** op `owner_id = auth.uid()`; RLS is de tweede laag, geen vervanging.                                        |
| Supabase via CDN `<script>` in `index.html`                  | Importeer via npm zodat de Vite-bundle offline werkt in de Android WebView.                                                     |
| Dubbele globale click-handlers (`document.addEventListener`) | Vue events per component; één listener per zorg, en ruim hem op in `onBeforeUnmount`.                                           |
| `window.confirm` als bevestiging                             | Eigen component met toegankelijkheid, of (bij items) de twee-staps knop van §8.6.                                               |
| Registratie open voor iedereen                               | Accounts alleen via uitnodiging, afgedwongen in de database (§7.6).                                                             |
| Ruwe technische fout (`TypeError`) in de UI                  | Fout afhandelen én mappen naar leesbare NL-tekst (§7.5).                                                                        |

## 12. Definition of Done (per taak)

Een taak is pas afgerond als:

- [ ] Implementatie voldoet aan specificaties hierboven
- [ ] `npm run typecheck` schoon (geen typefouten)
- [ ] `npm run test` groen — inclusief tests voor de nieuwe of gewijzigde logica
- [ ] `npm run build` slaagt **zonder typefouten** (`vue-tsc -b` clean)
- [ ] `npm run verify:data` groen wanneer de data-laag is aangeraakt
- [ ] `npm run dev` draait, functionaliteit handmatig getest (web)
- [ ] Prettier toegepast op gewijzigde bestanden (`npm run format:check` schoon)
- [ ] Geen `console.log` in productiecode
- [ ] Toegankelijkheid nagekeken waar relevant (focus, aria, ESC, `focus-visible`)
- [ ] Cross-user isolatie getest (inloggen als user A, uitloggen, inloggen als user B → geen data van A zichtbaar)
- [ ] Sync-behavior correct (outbox FIFO, retry/backoff, indicator toont juiste status)
- [ ] Bij auth-/registratiewijzigingen: negatieve test gedaan (zonder token, met verlopen token, met verkeerd e-mailadres)
- [ ] Taakregel in `tasks.md` of het planbestand is **[x]** gezet (na succesvolle afronding)
- [ ] Code consistent met bestaande stijl en architectuur

## 13. Regels "Niet doen"

- **NIET** handmatig bewerken in `dist/` of `android/app/src/main/assets/public/`.
- **NIET** secrets committen (`.env`, keystores `*.jks`, `*.keystore`, wachtwoorden).
- **NIET** CDN scripts toevoegen (Supabase via npm).
- **NIET** voorbeeldlijsten toevoegen voor ingelogde gebruikers.
- **NIET** destructieve bulk-sync implementeren.
- **NIET** open registratie: geen publieke `signUp` in de auth-laag, en geen client-side-only uitnodigingscontrole.
- **NIET** uitnodigingstokens in de URL laten staan, loggen of in `localStorage` bewaren.
- **NIET** een webhost opzetten om de uitnodigingslink werkend te krijgen; dat is precies wat de deep link (`com.lijstjes.app://`) overbodig maakt (§8.11).
- **NIET** een SMTP-provider instellen "om de herstelmail beter te maken"; het ontbreken daarvan is een bewust besluit (§8.11).
- **NIET** beloven in de UI dat de herstelmail altijd aankomt; de aflevering is beperkt (§8.11).
- **NIET** ruwe foutmeldingen (`TypeError`, stack traces, databasefouten) aan de gebruiker tonen.
- **NIET** `window.confirm` of een dialog gebruiken om items te verwijderen — dat is de twee-staps knop (§8.6).
- **NIET** `border-radius: 50%` op de item-checkbox; die is vierkant met afgeronde hoeken.
- **NIET** vóór akkoord van de gebruiker Android-builds/exports starten.
- **NIET** `[x]` zetten voordat de taak aantoonbaar af is.
