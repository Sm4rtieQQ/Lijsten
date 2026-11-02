# Fase 7 — Refactor (gedrag ongewijzigd)

> Opvolger van `tasks_03.md`. Doel: duplicatie en dode code weghalen, pure logica
> testbaar maken en de tooling op Windows schoon krijgen — **zonder** zichtbare of
> functionele wijziging. Elke taak: `npm run typecheck`, `npm run test`,
> `npm run verify:data` (bij data-laag) en `npm run format:check` groen.

## R1 — Tooling

- [x] **R1.1** `.gitattributes` met `* text=auto eol=lf`: op Windows (`core.autocrlf=true`) staan de bestanden als CRLF in de werkmap, waardoor `npm run format:check` op 51 bestanden faalt terwijl de repo zelf LF is.
- [x] **R1.2** `www/` uit `.gitignore` (legacy, zie AGENTS.md §4).

## R2 — Gedeelde helpers

- [x] **R2.1** `src/lib/platform.ts`: `isNativePlatform`, `APP_SCHEME`, `webRedirectTarget`, `emailRedirectTo` — `isNativePlatform` stond dubbel in `useAuth.ts` en `useDeepLink.ts`. Met spec.
- [x] **R2.2** `src/lib/validation.ts`: `MIN_PASSWORD_LENGTH` + `validateNewPassword(password, repeat)` — stond driemaal (`useAuth`, `RegisterView`, `ResetPasswordView`). Met spec.
- [x] **R2.3** `moveId(ids, fromId, toId)` in `src/lib/utils.ts` — identieke drop-logica in `HomeView` en `ListDetailView`. Met spec. — _tests groen; drag & drop nog in de browser controleren_ — _Akkoord gebruiker: webversie goedgekeurd (2026-11-02)._
- [x] **R2.4** `pruneQueueForList(queue, listId)` in `src/lib/outbox.ts` (uit `useLists.deleteList`) + `createOutboxEntry(op)`. Met spec.

## R3 — Composables opschonen

- [x] **R3.1** `useAuth`: herhaald patroon (fout wissen → supabase-guard → try/catch → NL-fout) in één `runAuthAction`-helper.
- [x] **R3.2** `useLists`: dode code weg (`pendingOps`, `requireUser`-wrapper) en characterization-tests (`useLists.spec.ts`) voor create/rename/delete/add/toggle/clear/reorder + outbox-inhoud.
- [x] **R3.3** `useSync`: dode code weg (`fetchFromServer`, `failedOps` — de UI toont bewust geen fouten, §7.4) en dubbele `maxAttempts`-berekening in één helper.
- [x] **R3.4** `lib/utils.ts`: ongebruikte `sleep` en `isIsoDateTime` weg.
- [x] **R3.5** `errorMessages.ts`: dubbele regel-lus in één `matchRules`-helper.
- [x] **R3.6** `sync.ts`: rij → domein-mapping als losse `toDomainList`-functie.

## R4 — Componenten (identieke DOM)

- [x] **R4.1** `AuthCard.vue` (kop met eyebrow + `Lijstjes` + vinkje) — viermaal gedupliceerd in Login/Register/Verify/Reset. — _code af, tests groen; wacht op browsercheck gebruiker_ — _Akkoord gebruiker: webversie goedgekeurd (2026-11-02)._
- [x] **R4.2** `PasswordInput.vue` (veld + oog-toggle) — gedupliceerd in Login/Register/Reset. — _code af, tests groen; wacht op browsercheck gebruiker_ — _Akkoord gebruiker: webversie goedgekeurd (2026-11-02)._
- [x] **R4.3** Iconen (`IconDragHandle`, `IconTrash`) gedeeld tussen `HomeView` en `ListDetailView`. — _code af, tests groen; wacht op browsercheck gebruiker_ — _Akkoord gebruiker: webversie goedgekeurd (2026-11-02)._

## Bewust buiten scope (vereist visuele controle door de gebruiker)

- [ ] `styles.css` (1221 regels) ontdubbelen — o.a. dubbele `.check-button`-regels (§9). Alleen samen met een browsercheck.
- [ ] `App.vue`: splash-/hydrate-timers naar een `useSplash`-composable.
