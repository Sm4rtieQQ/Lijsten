# Fase 8 — Navigatie, synchroniseren en slepen

> Opvolger van `tasks_04.md`. Vijf wijzigingen, **elk in een eigen commit**
> (N1 t/m N5), in deze volgorde: N3 levert de gedeelde sync-functie waar N4
> op leunt. Per taak: vitest-tests, `npm run typecheck`, `npm run test`,
> `npm run build`, `npm run format:check`, handmatige test in `npm run dev`, en
> het bijbehorende AGENTS.md-hoofdstuk in **dezelfde** commit bijwerken.
> Android-specifiek gedrag (terugknop, swipe op het toestel) wordt pas na akkoord
> getest op het apparaat (N6, gated).

## Huidige situatie (onderzocht)

- **Terug naar overzicht na wisselen van app/tabblad.** Oorzaak gevonden: bij
  elke terugkeer roept supabase-js `_recoverAndRefresh()` aan en vuurt
  `SIGNED_IN` met een **nieuw** `user`-object. `useAuth` zet `user.value`
  opnieuw, de `watch(user)` in `App.vue` ziet een wijziging en start
  `beginHydrate()` → `hydrate()` zet `activeListId = null` en toont het
  laadscherm. Het is dus geen bewuste navigatie maar een onterechte
  her-hydratatie.
- **Android-terugknop.** Er is geen `backButton`-listener. Capacitor valt dan
  terug op `history.back()` of — zonder historie — **sluit de app**. De app
  gebruikt geen historie, dus terug sluit altijd.
- **Pill-klik.** `syncNow()` doet alleen `runFlush()` (outbox **pushen**), geen
  pull van de server. Ingeklapt is de pill 16×18 px: te klein om met een vinger
  te raken (§9: 44×44).
- **Synchroniseren bij terugkeer.** `refreshData()` (push + pull) roept
  `flushOutbox` rechtstreeks aan, buiten `useSync` om: de pill toont dan geen
  spinner en de status loopt niet mee.
- **Slepen.** HTML5 drag & drop met `draggable` op het **handvat**: de browser
  toont als sleepbeeld alleen het handvat-icoon, niet de kaart/het item. Op
  Android (touch) is HTML5-DnD bovendien onbetrouwbaar.

## N1 — Laatst bezochte pagina blijft staan (bugfix + persistentie)

- [x] **N1.1** `App.vue` `watch(user)`: alleen reageren op een **andere
      gebruiker** (`prev?.id !== next?.id`). Dezelfde gebruiker met een nieuw
      sessie-object (`SIGNED_IN`/`TOKEN_REFRESHED` na terugkeer) → geen reset,
      geen hydrate, geen laadscherm; hooguit een gewone sync (N3).
- [x] **N1.2** Laatste pagina per gebruiker bewaren: `lijstjes:view:<userId>`
      (`null` = overzicht, anders `listId`) in `lib/storage.ts`, meegewist door
      `clearUserData` (§7.1: per-user key, weg bij uitloggen).
- [x] **N1.3** `hydrate()` zet `activeListId` niet meer hard op `null`, maar
      herstelt de bewaarde pagina zodra de lijst in de cache staat. Bestaat de
      lijst niet (meer), na de pull ook niet → overzicht.
- [x] **N1.4** `setActiveList` schrijft de pagina weg; wordt de actieve lijst
      verwijderd (lokaal, of op een ander apparaat en binnengehaald door een
      pull) → terug naar overzicht.
- [x] **N1.5** Tests: `useLists.spec` (herstel na hydrate, verwijderde lijst →
      overzicht, reset wist de key), `App`-gedrag: hetzelfde `user.id` met een
      nieuw object triggert geen hydrate.
- [ ] **N1.6** Handmatig: lijst openen → ander tabblad → terug = zelfde lijst;
      pagina herladen = zelfde lijst; uitloggen/inloggen als B = overzicht van B.
- [x] Commit + AGENTS.md (§7.1 key, nieuwe §8.13 "Navigatie").

## N2 — Android-terugknop sluit de app niet meer

Gedrag van de terugknop, in volgorde van prioriteit:

1. Open dialoog (nieuw lijstje, verwijderbevestiging) → dialoog sluiten.
2. Open accountmenu → menu sluiten. Item in bewerkmodus → bewerken annuleren.
3. Detailweergave → terug naar het **overzicht**.
4. Registratie-/verificatie-/herstelscherm → terug naar inloggen.
5. Overzicht of inlogscherm → `App.minimizeApp()`: de app gaat naar het
   Android-startscherm maar **blijft draaien** (wordt niet afgesloten).

- [x] **N2.1** `composables/useBackNavigation.ts`: een stapel terug-handlers
      (laatst geregistreerd = eerst aan de beurt). Componenten registreren in
      `onMounted`/bij openen en ruimen op in `onBeforeUnmount`/bij sluiten (§5).
      `handleBack(): boolean` → `false` als niemand het afhandelt.
- [x] **N2.2** `App.vue`: op native `App.addListener("backButton", …)` →
      `handleBack()` of anders `App.minimizeApp()`. Listener opruimen in
      `onBeforeUnmount` (zelfde patroon als `useDeepLink`).
- [x] **N2.3** Registraties in `HomeView` (menu, dialogen), `ConfirmDeleteDialog`,
      `ListDetailView` (bewerken, terug naar overzicht) en de auth-schermen. _Uitvoering: de auth-schermen lopen via de fallback in `App.vue` in plaats van een eigen registratie (zelfde volgorde als de view-keuze)._
- [x] **N2.4** Web: de logica wordt getest via vitest (mock `@capacitor/app`);
      in de browser blijft ESC het equivalent voor dialogen/menu.
- [x] **N2.5** Tests: volgorde van de stapel, opruimen, fallback naar minimize.
- [x] Commit + AGENTS.md §8.13.

## N3 — Volledige sync via de pill (en één sync-functie)

- [x] **N3.1** `useSync.syncWithServer()`: outbox pushen **en daarna** de server
      binnenhalen (alleen bij een lege outbox, zoals nu in `refreshData`). Eén
      lopende sync tegelijk (gedeelde promise); status `syncing` voor de hele
      duur, daarna `synced` of `error`. `refreshData` in `useLists` levert de
      pull aan via een geregistreerde callback (geen circulaire import).
- [x] **N3.2** Alle sync-triggers gebruiken deze functie: pill-klik,
      `visibilitychange` in `App.vue`, `hydrate` en straks de swipe (N4).
      `flushOutbox` blijft nooit rejecten (§7.5); het `online`-event en de
      retry/backoff blijven werken.
- [x] **N3.3** Pill-klik werkt ook **ingeklapt** (alleen de dot): de
      klikzone wordt minimaal 44×44 px via een onzichtbaar `::before`-vlak,
      zónder dat de pill visueel groter wordt. Tijdens `syncing` niet klikbaar.
      _Uitvoering: een transparante rand van 13px met negatieve marge i.p.v. `::before` — de pill heeft `overflow: hidden`, dat zou een `::before`-vlak afknippen. Visueel nog te controleren in de browser._
- [x] **N3.4** Tests: `useSync.spec` (push + pull, geen dubbele sync, status
      tijdens/na), `SyncIndicator.spec` (klik ingeklapt → sync).
- [x] Commit + AGENTS.md §7.4.

## N4 — Swipe omlaag synchroniseert (pull-to-refresh)

- [x] **N4.1** `composables/usePullToRefresh.ts` (pointer-events, alleen
      `pointerType === "touch"`): start alleen als de pagina helemaal bovenaan
      staat (`scrollY === 0`) en niet op een invoerveld, sleephandvat of in een
      dialoog. Weerstand op de afstand; drempel ± 64 px.
      _Uitvoering: touch-events i.p.v. pointer-events — bij pointer-events neemt de browser het gebaar over om te scrollen (`pointercancel`). De toestandsmachine is puur; `PullToRefresh.vue` doet de listeners._
- [x] **N4.2** Indicator bovenaan: een ronde spinner in het oranje palet
      (bestaande `@keyframes spin`) die meeschuift met de vinger; bij loslaten
      voorbij de drempel → `syncWithServer()` (N3); de pill toont dan zijn
      spinner en daarna **groen** (of rood bij een fout). Onder de drempel →
      terugveren zonder sync.
- [x] **N4.3** `overscroll-behavior-y: contain` op de pagina, zodat Chrome/PWA
      niet zelf de pagina herlaadt bij omlaag swipen.
- [x] **N4.4** Werkt in overzicht én detailweergave; botst niet met slepen (N5)
      of verticaal scrollen.
- [ ] **N4.5** Tests: drempel, niet starten als er gescrold is, sync één keer.
      Handmatig in Chrome DevTools met touch-emulatie. _Tests af (usePullToRefresh.spec, PullToRefresh.spec); handmatige check nog door de gebruiker._
- [x] Commit + AGENTS.md (nieuwe §8.14).

## N5 — Slepen toont een zwevende kopie

- [x] **N5.1** Slepen herbouwen op **pointer-events** in plaats van HTML5-DnD:
      werkt gelijk met muis en touch (Android), en geeft volledige controle
      over het sleepbeeld. Gedeelde logica in `composables/useDragReorder.ts`,
      gebruikt door `HomeView` (lijstkaarten) en `ListDetailView` (items).
- [x] **N5.2** Bij het oppakken (via het handvat) een **zwevende kopie** van de
      hele kaart/het item: `position: fixed`, zelfde breedte, lichte schaduw en
      kanteling, volgt de vinger/muis. De originele plek blijft als
      half-transparante placeholder staan (bestaande `.dragging`-stijl); de
      oranje lijn (`.drag-over`) toont waar hij landt.
      _Uitvoering: de kopie is dezelfde component (`ListCard.vue`/`ItemRow.vue`, uit `HomeView`/`ListDetailView` gehaald) met `ghost`, via `Teleport`; geen gekloonde DOM-nodes. Extra: de oranje lijn staat onder het doel bij naar beneden slepen, en na een sleep wordt één klik ingeslikt._
- [x] **N5.3** Automatisch scrollen bij de rand van het scherm; ESC of
      `pointercancel` breekt af zonder wijziging. Bij loslaten `moveId` →
      `reorderLists`/`reorderItems` (outbox ongewijzigd).
- [x] **N5.4** Touch: `touch-action: none` op het handvat (niet op de hele
      kaart), zodat scrollen en de swipe (N4) blijven werken.
- [x] **N5.5** Toegankelijkheid: het handvat blijft een knop met `aria-label`.
- [ ] **N5.6** Tests: `useDragReorder` (doel bepalen, afbreken, resultaat naar
      `moveId`). Handmatig met muis en met touch-emulatie. _Tests af (useDragReorder.spec, HomeView.spec); handmatige check nog door de gebruiker._
- [x] Commit + AGENTS.md (nieuwe §8.15 Slepen).

## N6 — Android-test (gated: pas na akkoord gebruiker op de webversie)

- [ ] Versie 1.4 (`package.json`, `versionName`/`versionCode`), `CACHE_VERSION`
      in `public/sw.js` verhogen, build + `android:sync`, APK volgens §10.2.
- [ ] Op het toestel: terugknop (alle vijf gevallen), terugkeer na app-wissel
      = zelfde pagina, koude start = zelfde pagina, swipe omlaag, pill-klik
      ingeklapt, slepen met de vinger.

## Besluiten (gebruiker, 2026-11-02)

- **Terugknop op het overzicht:** `minimizeApp()` — naar het
  Android-startscherm, de app blijft draaien.
- **Slepen:** herbouwen op pointer-events (werkt met muis én touch), niet
  HTML5-DnD met `setDragImage`.
- **Volgorde:** eerst N1 t/m N3; N4 en N5 daarna.
