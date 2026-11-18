# 01 — sync-dup-key: `23505 list_items_pkey` bij synchroniseren

Navigator research, read-only. Branch `Development`. Nothing was run against Supabase; all findings come from code reading (`file:line`). Items marked _(unverified)_ were not reproduced.

## 1. Question

The app shows a red sync pill. PostgREST returns Postgres `23505 duplicate key value violates unique constraint "list_items_pkey"` on a bulk `INSERT INTO public.list_items` (json_to_record), i.e. the batched `item.create` from `nextBatch`/`flushOutbox`. Why does an `item.create` for an already-existing id reach the server, and why does the app not recover? Scope: `src/lib/sync.ts`, `src/lib/outbox.ts`, `src/composables/useSync.ts`, `useLists.ts`, `App.vue`, specs, `scripts/verify-data-layer.ts`, AGENTS.md §7.3/§7.4.

## 2. What I found

There are two separate problems: **(A) how a duplicate arises** and **(B) why one duplicate is never recovered from** (the real cause of the "stuck red" state).

### B. A single duplicate is permanent: deadlock (primary root cause)

1. `item.create` is a plain `insert` (`src/lib/sync.ts:196` batch, `:315` single). It is not idempotent: if the row already exists the server answers 23505. `list.create` has the same shape (`sync.ts:288`).
2. A duplicate is **never treated as success**. `guarded` maps every error to a Dutch string and drops the `code` (`sync.ts:223-240`, `errorMessages.ts:80-92`; the string "23505" is only a keyword match). `flushOutbox` then marks the whole batch failed (`attempts+1`, `lastError = "Dit item bestaat al."`) and stops (`sync.ts:86-111`).
3. Retry never changes the outcome. The entry stays at the head of the FIFO queue. `nextBatch` sends a server-rejected entry **alone** (`outbox.ts:138`, spec `outbox.spec.ts:231`), which just re-sends the same insert, which gets the same 23505, with backoff capped at 60 s (`sync.ts:461`) forever (`useSync.ts:266-269`, `scheduleRetry`).
4. Because of FIFO + "stop at first error", **every operation behind the poisoned create is blocked too** (later creates, updates, deletes, reorders). The pill stays red (`useSync.ts:137`, `queue.some(hasFailed)`).
5. `pullFromServer` only runs when the outbox is empty (`useLists.ts:104`; `useSync.ts:309-313` skips the pull if the flush did not finish). So the app also never pulls: the user sees stale data on this device and cannot get out of the state. Only logging out (which wipes the outbox, §7.1) or clearing storage recovers it, and logging out with a non-empty outbox shows the "wijzigingen gaan verloren" warning (§7.3).
6. Batch effect: one duplicate row in a bulk insert fails the **entire** statement (atomic), so up to 100 good rows are marked failed too (`outbox.ts:107`). After the first failure the `lastError` is `DUPLICATE_ERROR`, which is not in `TRANSIENT_ERRORS` (`outbox.ts:110-120`), so the batch is broken up into single inserts. Each good row then succeeds individually (the queue shrinks by one per run), but only until it reaches the actual duplicate, where it sticks (point 3).

The design is aware of the premise: `outbox.ts:21-24` and `verify-data-layer.ts:572-573` say "a failed create may have reached the server after a timeout". The consequence (retry must be idempotent) was not drawn: AGENTS.md §7.3 even states "genoeg data om idempotent te kunnen verwerken", but the insert is not idempotent.

### A. How an `item.create` with an existing id reaches the server

Ranked by likelihood.

1. **Timeout / lost response, then retry (very likely, the main trigger).**
   `withTimeout` gives up after `REQUEST_TIMEOUT_MS = 10 s` (`sync.ts:134-156`) but does **not** cancel the HTTP request; its result is ignored. Postgres usually commits anyway. The batch is marked failed with `CONNECTION_DROPPED`/`NETWORK_ERROR`, which are explicitly "transient" and re-batchable (`outbox.ts:110-120`). The retry re-inserts the same ids → 23505. Typical on mobile (Android WebView): weak signal, a bulk insert of many rows, response lost. The request can even still be in flight when the retry fires (backoff starts at 1 s×2^attempts, `sync.ts:461`, while the timeout is 10 s), so the retry may race its own original request.
2. **App killed or backgrounded mid-flush (likely on Android).** `flushOutbox` only persists the queue after the request returns (`settle`, `sync.ts:69-77, 95, 123`). `visibilitychange → hidden` triggers a best-effort `flushNow()` (`App.vue:171-175`). If Android freezes/kills the WebView after the server committed but before `settle`, the entries are still in localStorage with `attempts = 0`. On next start they look fresh and are re-sent → 23505. (This also bypasses the "failed ⇒ untouched by compact" safeguard because they were never marked.)
3. **Several tabs/instances share one outbox.** The queue lives in `localStorage` per user (`storage.ts:73-87`), but each tab has its own module state: `flushInFlight`, `syncTimer`, `retryTimer` (`useSync.ts:53-66`), and there is no `storage` event listener, `BroadcastChannel` or `navigator.locks` anywhere (grep: none). The PWA + a browser tab, or two tabs, load the same queue and both send the same creates (the 30 s debounce timers fire at nearly the same time, and `hidden`/`visible` events fire in both). The loser gets 23505. Also: tab B can `saveQueue` over tab A's queue (last writer wins), which can resurrect already-sent entries.
4. **Two overlapping flushes in one instance (less likely).** `runFlush` dedups via `flushInFlight` (`useSync.ts:222-229`), and `doSync` awaits it, so within one tab this is guarded. Residual: timeout case (1) where the abandoned request is still running.
5. **`compactOutbox` (not a cause found).** It only merges never-attempted ops (`outbox.ts:21-24, 47-51`) and keys on item id, so it cannot create a duplicate id. Edge: two fresh `item.create` with the _same_ id in one queue would both survive (`remember` overwrites the map but not `out`, `outbox.ts:33-36`), but `createListItem` always makes a new id, so this would need a bug elsewhere _(unverified; not observed)_.
6. **opId/id reuse (not a cause found).** `createOutboxEntry` makes a new `opId` per op (`outbox.ts:158-170`); item ids come from `createListItem` (`types/app`, not re-read here). `settle` matches on `opId` and correctly drops sent entries.
7. **Pull overwriting local state (not a cause of 23505, but a related bug).** `pullFromServer` checks the queue is empty before the request, not after (`useLists.ts:104-110`). An item added while the pull is in flight is then wiped from `lists` (`lists.value = data`) although its `item.create` is queued; it re-appears only after the next sync. Not a duplicate, but a flicker/lost-display bug in the same area.

### Test coverage gaps

- No spec or verify check for "server answers 23505 → treat as success" or for the timeout-then-retry sequence (`outbox.spec.ts:231` only asserts that duplicates go alone; `verify-data-layer.ts:572` only asserts that a failed create is not merged).
- No multi-tab test.

## 3. Options

### Option 1: Make `item.create` / `list.create` idempotent on the server call (`upsert … ignoreDuplicates`)

Use `client.from("list_items").upsert(rows, { onConflict: "id", ignoreDuplicates: true })` (PostgREST `Prefer: resolution=ignore-duplicates` → `ON CONFLICT DO NOTHING`) for the batch (`sync.ts:196`), the single create (`sync.ts:315`) and `list.create` (`sync.ts:288`). A retry of a create that already landed becomes a no-op success.

- Pros: tiny change, fixes timeout/kill/multi-tab at the root, keeps one request per batch, no extra round trip. `ON CONFLICT DO NOTHING` needs only the INSERT policy (verify against `supabase/schema.sql:98+`).
- Cons: ignores a conflicting row silently, including one with different content (only possible with the same uuid; later `item.update` ops still apply). Needs a check that the RLS insert policy still applies on the proposed row (it does: `WITH CHECK` runs before conflict handling) _(unverified, test against a dev project, not production)_. Does not unblock queues that are _already_ stuck.
- Effort: S.

### Option 2: Treat `23505` as success (client side), with a split-and-retry fallback

Keep the plain insert, but keep the PostgREST `code` (extend `guarded`/`applyBatch` to return `{ ok, error, code }`). On `23505` for an `item.create`/`list.create` entry: single entry → count as done; batch → re-send entries individually so only the true duplicates are dropped.

- Pros: works without relying on upsert semantics; also unblocks queues that are already stuck (the next retry resolves them); pure client logic, easy to unit test.
- Cons: more code; an extra round trip in the batch-failure case; 23505 on a _different_ constraint (none today; `list_items` only has the pkey) would be swallowed unless matched on `constraint`/message (`list_items_pkey` / `lists_pkey`).
- Effort: M.

### Option 3: Stuck-queue recovery / dead-letter (defensive layer)

Whatever the cause, a permanently rejected op must not block the queue forever: classify errors as transient (network/timeout) vs permanent (23505, 23503 FK, RLS); for permanent errors drop or park the op after N attempts (or immediately for known-idempotent cases) and continue; make the pull also reconcile when only failed entries remain.

- Pros: generic safety net for the whole class (also FK 23503 after a list was deleted on another device, RLS 42501).
- Cons: dropping ops can lose user data silently, so it needs product decisions (AGENTS.md says the pill shows no error detail by design, §7.4); bigger surface.
- Effort: M–L.

### Option 4: Prevent concurrent flushes across tabs

`navigator.locks.request("lijstjes-flush-<userId>", …)` (fallback: a localStorage lease) around `doFlush`, and re-read the queue under the lock. Also listen to the `storage` event to refresh `queueLength`.

- Pros: removes cause A3 and the stale-overwrite of `saveQueue`.
- Cons: does not help timeout (A1) or kill (A2); Web Locks availability in the Capacitor WebView should be checked _(unverified)_.
- Effort: M.

### Option 5 (small, independent): shrink the timeout race

Abort the request with `AbortSignal` on timeout (`.abortSignal()` in supabase-js) and/or do not start a retry while the previous request may still be running. Reduces A1's race but cannot remove it (the server may already have committed).

- Effort: S. Only a mitigation.

## 4. Recommendation

**Option 1 as the fix, plus Option 2's client-side handling for already-stuck queues, delivered as separate small issues:**

1. Idempotent creates (`upsert` with `ignoreDuplicates`) for `item.create`, `list.create` and the batch path. Fixes A1–A3 at once and stops new occurrences.
2. Keep the PostgREST `code` through `guarded` and treat `23505` on a create as success (with split-and-retry for batches) so queues that are **already stuck** recover on the next sync without logging out. This is also the safety net if upsert behaves unexpectedly under RLS.
3. Tests + verify-script checks for the timeout-then-retry and duplicate-on-retry paths.
4. Optional follow-ups: cross-tab lock (Option 4), abort-on-timeout (Option 5), pull re-check (A7), and a product decision on a general dead-letter strategy (Option 3).

Why: the dup itself is unavoidable in an offline-first, at-least-once outbox (timeouts and kills cannot be excluded), so the correct property is **idempotent apply**. Locks and timeouts only reduce frequency. Option 3 as a generic mechanism is bigger and touches data-loss semantics, so it should wait for a user decision.

## 5. Risks

- **Data:** swallowing a duplicate assumes the existing row is "the same" row (same uuid, created by this outbox). Items are uuid v4 (`crypto.randomUUID`), so a foreign collision is negligible. Later `item.update`/`reorder` ops in the queue still bring the server to the final state.
- **Security/RLS:** the upsert must keep owner checks. Verify on a **dev/test** Supabase project that `ON CONFLICT DO NOTHING` + the `items_insert_own` policy behaves as expected, and that no cross-user row can be touched. Do not test on production data.
- **Already-stuck users:** option 1 alone does not heal them if the failed entries keep being single-sent as plain inserts; they only heal once the code path is the idempotent one (it will be, since the retry also uses the new insert path). Add a test for this.
- **`DUPLICATE_ERROR` text** ("Dit item bestaat al.") is currently only a `lastError` string and never visible (§7.4: no error text in the UI), so no UI-text change is needed.
- **Tests gap:** the fake client in `verify-data-layer.ts` only models `insert`, not `upsert`; it must be extended (`scripts/verify-data-layer.ts:110-125`).
- **Performance:** upsert with ignore-duplicates costs the same as insert in Postgres for the happy path.
- **Compatibility:** `database.types.ts` types should accept upsert on both tables (check generics).

## 6. Open questions (with suggested answers)

1. Should a permanently rejected operation (FK 23503, RLS) ever be dropped automatically? Suggested: **no for now**; handle only the known-idempotent 23505, and track the general strategy in its own issue.
2. Is it acceptable that the user is not told when a duplicate is swallowed? Suggested: **yes** (it is a successful retry; §7.4 shows no details anyway).
3. Can the user supply the real failing payload/`lastError`/`attempts` from the device (localStorage `lijstjes:queue:<userId>`) to confirm timeout vs. kill vs. multi-tab as the trigger? Suggested: **nice to have**, the fix does not depend on it.
4. Is the Android WebView / PWA run as more than one instance (e.g. browser tab + installed PWA at the same time)? Suggested: ask once; it decides whether the cross-tab lock issue is worth doing now.

## 7. Proposed issues

Labels suggestion: `bug`, `sync`, `outbox`, `tests`, `enhancement`. UI texts Dutch, identifiers English.

### Issue 1: `item.create` and `list.create` must be idempotent (no more 23505 after a retry)

**Labels:** `bug`, `sync`, `outbox`
**Problem:** After a timeout/lost response, an app kill or a second tab, the outbox re-sends an `item.create` whose row already exists. The plain `insert` fails with 23505 `list_items_pkey`; the whole bulk statement fails, and the queue is blocked forever (red pill, no pull). See `docs/research/01-sync-dup-key.md`, sections B and A.
**Proposed fix:** In `src/lib/sync.ts` use `upsert(rows, { onConflict: "id", ignoreDuplicates: true })` for the batched `item.create` (line ~196), the single `item.create` (~315) and `list.create` (~288, `onConflict: "id"`; keep `owner_id: userId`). Keep `update`/`delete` as they are.
**Acceptance criteria:**

- Sending the same `item.create` (single and in a batch) twice results in success both times; the queue is empty afterwards.
- A batch in which some ids already exist inserts the missing rows and succeeds.
- A `list.create` for an existing list id succeeds without overwriting its title.
- No request ever contains an `owner_id` other than the current user; RLS tests/notes on a dev project show no cross-user effect.
- `npm run test`, `npm run verify:data`, `npm run typecheck` green.
  **Affected files:** `src/lib/sync.ts`, `src/lib/database.types.ts` (if needed), `scripts/verify-data-layer.ts` (fake client must support `upsert`), `src/lib/sync.spec.ts` (new) or existing specs.

### Issue 2: Recover already-stuck outboxes: treat 23505 on a create as success

**Labels:** `bug`, `sync`, `outbox`
**Problem:** `guarded` drops the Postgres error code (`sync.ts:223-240`), so a duplicate is just a Dutch string and is retried forever (`outbox.ts:138` sends it alone, again 23505). Users already in this state stay red until they log out.
**Proposed fix:** Return `code` (and constraint/message if useful) from `guarded`/`applyBatch`. For `item.create`/`list.create` entries, `23505` on `list_items_pkey`/`lists_pkey` counts as done. If a batch fails with 23505, do not mark all rows failed: re-send the rows individually and only drop the true duplicates. Other constraints/errors keep the current behaviour. Do not show a new UI text.
**Acceptance criteria:**

- Given a queue whose head `item.create` has `lastError = "Dit item bestaat al."` and the server returns 23505, the next flush removes it and continues with the rest of the queue.
- A bundle of N creates where 2 exist: the other N−2 are inserted, the queue ends empty, `ok = true`.
- Other errors (network, RLS, FK) still mark the entry failed with backoff (unchanged tests stay green).
- After a successful recovery the pill turns green and the pull runs.
  **Affected files:** `src/lib/sync.ts`, `src/lib/outbox.ts` (batching rules around `DUPLICATE_ERROR`), `src/lib/errorMessages.ts` (only if the code must be exported), specs.

### Issue 3: Tests and verify-script checks for retry-after-timeout and duplicate creates

**Labels:** `tests`, `sync`
**Problem:** There is no test for "request committed on the server but the client saw a timeout, then retried", nor for the duplicate path; this is the scenario that broke production.
**Proposed fix:** Add cases to `scripts/verify-data-layer.ts` (fake client that commits the insert and then rejects with a timeout; then retries) and unit tests for `flushOutbox` (`src/lib/sync.spec.ts`): timeout → retry → single success; the app killed after the commit (queue unmarked, re-sent) → success; duplicate inside a batch.
**Acceptance criteria:** the new tests fail on current `Development` and pass after issues 1/2; `npm run test` and `npm run verify:data` green.
**Affected files:** `scripts/verify-data-layer.ts`, `src/lib/sync.spec.ts`, `src/lib/outbox.spec.ts`.

### Issue 4: One flusher per user across tabs (lock around the outbox flush)

**Labels:** `bug`, `sync`, `enhancement`
**Problem:** Several tabs/instances share `localStorage:lijstjes:queue:<userId>` but each has its own `flushInFlight` and timers (`useSync.ts:53-66`); no `storage` event, no lock. Both send the same ops, and `saveQueue` from the slower tab can write back already-sent entries.
**Proposed fix:** Wrap `doFlush` in `navigator.locks.request("lijstjes-flush-" + userId, { ifAvailable: true }, …)` (fallback: a short localStorage lease with expiry); re-read the queue inside the lock. Listen to the `storage` event for `lijstjes:queue:<userId>` to refresh `queueLength` and the status.
**Acceptance criteria:**

- Two simulated instances flushing the same outbox send each op once (test with a fake lock or two module instances).
- If Web Locks is unavailable, the app still works as today (no crash).
- The pill in the second tab updates after the first tab flushed.
  **Affected files:** `src/composables/useSync.ts`, `src/lib/storage.ts`, `src/composables/useSync.spec.ts`. _Check first whether Web Locks exists in the Android WebView version in use._

### Issue 5: A timeout must not start a second copy of the same request

**Labels:** `bug`, `sync`
**Problem:** `withTimeout` (`sync.ts:142`) rejects after 10 s but the request keeps running; the retry (backoff from 1 s) can overlap it.
**Proposed fix:** Pass an `AbortSignal` (supabase-js `.abortSignal(signal)`) that is aborted on timeout, and let the next retry wait until the previous request has ended. Mitigation only; the idempotency from issue 1 remains the real fix.
**Acceptance criteria:** after a timeout the original request is aborted (test with a fake client that records the signal); no two requests for the same batch are in flight at once.
**Affected files:** `src/lib/sync.ts`, `src/lib/sync.spec.ts`.

### Issue 6: Pull must not overwrite changes made during the pull

**Labels:** `bug`, `sync`
**Problem:** `pullFromServer` checks that the outbox is empty before the request, not when the response arrives (`useLists.ts:104-110`). An item added during the pull disappears from the screen until the next sync.
**Proposed fix:** After the response, re-read the queue; if it is no longer empty, discard the pulled data (or merge) and leave local state as is.
**Acceptance criteria:** adding an item while a pull is pending keeps the item visible; a normal pull still replaces the state; test with a deferred pull in `useLists.spec.ts`.
**Affected files:** `src/composables/useLists.ts`, `src/composables/useLists.spec.ts`.

### Issue 7 (decision first): Permanent errors must not block the whole queue

**Labels:** `enhancement`, `sync`, `needs-decision`
**Problem:** Any permanently rejected op (23503 FK, RLS) blocks all later ops forever, same mechanism as section B.
**Proposed fix:** Classify errors as transient/permanent; after N attempts park permanent failures (keep them stored, not deleted) and continue; the pill may stay red while parked ops exist. Needs a user decision on data-loss semantics (open question 1) before work starts.
**Acceptance criteria:** to be defined after the decision; at least: no silent deletion of user data, later ops still sync, parked ops are retained for diagnosis.
**Affected files:** `src/lib/sync.ts`, `src/lib/outbox.ts`, `src/types/sync.ts`, `src/composables/useSync.ts`, AGENTS.md §7.3.

Suggested order: 1 and 2 together (or 2 first as it heals existing users), then 3, then 5/6/4; 7 after the decision.

## 8. Sources

`AGENTS.md` §7.1, §7.3, §7.4, §7.5; `src/lib/sync.ts`; `src/lib/outbox.ts`; `src/lib/errorMessages.ts`; `src/lib/storage.ts` (`loadQueue`/`saveQueue`); `src/types/sync.ts`; `src/composables/useSync.ts`; `src/composables/useLists.ts`; `src/App.vue` (`onVisibilityChange`); `src/lib/outbox.spec.ts:231`; `scripts/verify-data-layer.ts:566-600`; `supabase/schema.sql` (`list_items` pkey, RLS); `docs/tasks_06.md` (V1–V2, bundling plan); `git log` (24d08ea "gebundeld versturen", e7968dd "niets dubbel", 84405d3 "samenvoegen"). Not read in full: `src/types/app.ts` (`createListItem` id generation), `useSync.spec.ts`, `useLists.spec.ts`.
