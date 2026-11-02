# Fase 9 — Minder verkeer tussen app en server

> Opvolger van `tasks_05.md` (N6, de Android-test, wacht nog op akkoord en neemt
> deze fase mee in versie 1.4). Vier stappen, **elk in een eigen commit**
> (V1 t/m V4). Per stap: vitest-tests, `npm run typecheck`, `npm run test`,
> `npm run verify:data` (data-laag), `npm run build`, `npm run format:check`,
> handmatige test in `npm run dev`, en het bijbehorende AGENTS.md-hoofdstuk in
> **dezelfde** commit bijwerken.

## Huidige situatie (onderzocht)

- Na elke wijziging stuurt de app de outbox na **0,7 s** (`scheduleFlush(700)`),
  operatie voor operatie, elk een eigen request.
- **Item toevoegen is duur:** een nieuw item komt bovenaan, dus `addItem`
  zet een `item.create` **plus** een `item.reorder` van de hele lijst in de
  outbox, en `item.reorder` stuurt **één UPDATE per item**. 10 items toevoegen
  aan een lege lijst ≈ 65 requests; aan een lijst van 50 ≈ 565.
- **Slepen** kost ook één UPDATE per item, parallel; valt de verbinding
  halverwege weg, dan staat de volgorde half opgeslagen op de server.
- **Uitloggen wist de outbox** (`clearUserData`): met een wachttijd van 30 s
  zouden niet-verstuurde wijzigingen verloren gaan.

## Besluiten (gebruiker, 2026-11-02)

- Versturen **30 s na de laatste wijziging**, met een **maximum van 2 minuten**
  bij doorlopend bewerken.
- De pill staat tijdens het wachten op **`In wachtrij`** (amber): de gebruiker
  kan zelf eerder synchroniseren (pill of swipe).
- De **automatische pull** bij terugkeren naar de app/het tabblad hooguit
  **één keer per 30 s**. Pill en swipe blijven direct.
- Volgorde opslaan via een **databasefunctie** (optie 4a), met terugval op de
  huidige per-item-updates zolang de functie nog niet bestaat.

## V1 — Versturen 30 s na de laatste wijziging

- [x] **V1.1** `useSync`: elke mutatie (`markDirty`) start de timer opnieuw;
      pas na **30 s** zonder wijziging `runFlush()`. Maximaal **2 min** na de
      eerste nog niet verstuurde wijziging wordt er toch verstuurd.
- [x] **V1.2** Direct versturen (timer vervalt): pill-klik en swipe
      (`syncWithServer`), `online`-event, en de app naar de achtergrond
      (`visibilitychange` → `hidden`, best effort; de outbox staat lokaal en gaat
      anders bij de volgende start mee).
- [x] **V1.3** **Uitloggen:** eerst `syncWithServer()`. Lukt dat niet (outbox
      niet leeg), dan wordt de `Uitloggen`-knop gewapend met de twee-staps
      bevestiging van §8.6 (`useArmedConfirm`): `Toch uitloggen` met een
      `aria-label` dat niet-verstuurde wijzigingen verloren gaan. Pas de tweede
      klik logt uit. Geen technische termen.
      _Extra: het label van de pill was `In wachtrijst` (typfout); nu `In wachtrij`._
- [x] **V1.4** Automatische pull bij terugkeren (`App.vue`, `visibilitychange`)
      hooguit één keer per 30 s; pill en swipe zijn niet begrensd.
- [x] **V1.5** Retry/backoff na een mislukte poging blijft ongewijzigd.
- [ ] **V1.6** Tests (fake timers): timer start opnieuw bij elke wijziging,
      maximum van 2 min, directe triggers, uitloggen met en zonder lege outbox,
      pull-begrenzing. Handmatig: tien items toevoegen → pill 30 s amber → één
      sync. _Tests af (useSync, App, HomeView.logout); handmatige check nog door de gebruiker._
- [x] Commit + AGENTS.md §7.3/§7.4 (wachttijd, pill-status, uitloggen).

## V2 — Wachtende wijzigingen samenvoegen

- [x] **V2.1** Pure `compactOutbox(queue)` in `lib/outbox.ts`, toegepast vlak
      vóór het versturen. FIFO en afhankelijkheden blijven kloppen:
  - item aangemaakt en daarna gewijzigd → één `item.create` met de eindstand;
  - item meerdere keren gewijzigd → alleen de laatste `item.update`;
  - item aangemaakt en verwijderd, nog niet verstuurd → beide weg;
  - lijst aangemaakt en hernoemd → één `list.create` met de laatste titel;
    meerdere `list.update` → alleen de laatste;
  - meerdere `item.reorder` van dezelfde lijst / meerdere `list.reorder` →
    alleen de laatste (op de plek van de laatste, ná de creates).
- [x] **V2.2** Al gefaalde operaties behouden hun `attempts`/`lastError`
      (samengevoegd: het hoogste aantal pogingen).
      _Uitvoering (strenger): alleen nog nooit geprobeerde operaties worden samengevoegd; een gefaalde operatie kan na een timeout tóch op de server staan en blijft ongemoeid, er wordt ook niets in opgevouwen._
- [x] **V2.3** Tests in vitest én `scripts/verify-data-layer.ts`
      (`npm run verify:data`): elke regel, volgorde, idempotentie, geen
      operatie van een andere lijst geraakt.
- [x] Commit + AGENTS.md §7.3.

## V3 — Minder requests per keer versturen

- [x] **V3.1** Opeenvolgende `item.create` → één insert met alle rijen.
- [x] **V3.2** Opeenvolgende `item.delete` (ook `Verwijder afgevinkt`) → één
      `delete().in("id", ids)`, nog steeds gefilterd op de lijst.
- [x] **V3.3** Item toevoegen herschikt de lijst niet meer: het nieuwe item
      krijgt positie `kleinste positie − 1`, dus geen `item.reorder` meer bij
      `addItem`. Slepen nummert nog wel door. Server en pull sorteren al op
      `position`; negatieve posities zijn geldig (`integer`).
- [x] **V3.4** Mislukt een gebundeld request, dan worden alle operaties erin
      gemarkeerd (`attempts+1`, `lastError`) en opnieuw geprobeerd met backoff;
      `flushOutbox` rejecteert nog steeds nooit (§7.5).
      _Uitvoering: alleen een operatie die de server weigerde gaat voortaan alleen; na een netwerkfout of timeout mag hij weer mee in een bundel (anders ging na een offline periode alles los). Ook de deletes zijn per lijst gebundeld (`.in("id")` + `.eq("list_id")`)._
- [x] **V3.5** Tests + `verify:data`: bundels, foutpad, FIFO, posities na
      toevoegen. Doel uit het voorbeeld: 10 items aan een lijst van 50 →
      **1 request** (was ≈ 565).
- [x] Commit + AGENTS.md §7.3.

## V4 — Volgorde opslaan in één request (databasefunctie)

- [x] **V4.1** Nieuw `supabase-reorder.sql` (idempotent):
      `reorder_items(p_list_id uuid, p_item_ids uuid[])` en
      `reorder_lists(p_list_ids uuid[])`, beide `language sql`,
      **`security invoker`** (de bestaande RLS-regels gelden: eigen lijsten,
      bevestigd e-mailadres), `set search_path = public`; één `UPDATE … FROM
unnest(…) WITH ORDINALITY`, dus alles-of-niets. `revoke` van
      `public`/`anon`, `grant execute` aan `authenticated`.
      `reorder_lists` filtert ook expliciet op `owner_id = auth.uid()` (§7.1).
- [ ] **V4.2** **Uitvoeren in de SQL Editor van Supabase — door de gebruiker**
      (kan niet vanuit de repo), daarna testen met een eigen account.
- [x] **V4.3** `sync.ts`: `item.reorder`/`list.reorder` via `client.rpc(…)`.
      Bestaat de functie nog niet (PostgREST `PGRST202`/404), dan terugvallen op
      de huidige per-item-updates. Zo werkt de app vóór én na het script.
- [x] **V4.4** `database.types.ts`: `Functions` voor beide functies.
- [x] **V4.5** Tests + `verify:data`: rpc-pad, terugval, fout → NL-tekst.
- [x] Commit + AGENTS.md (§7.3, projectstructuur met `supabase-reorder.sql`).

## Gevolgen (bewust)

- Andere apparaten zien wijzigingen tot **30 s** later (tot 2 min bij
  doorlopend bewerken). Pill of swipe verstuurt direct.
- De pill staat na elke wijziging tot 30 s op `In wachtrij`.
