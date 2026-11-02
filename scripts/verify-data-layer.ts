/**
 * Verificatie van de fase 2 data-laag (offline-first + cross-user isolatie).
 *
 * Controleert aantoonbaar:
 *  1. Per-user localStorage-isolatie (geen cross-user datalek).
 *  2. Outbox-drain gebeurd per entiteit — NOOIT bulk-wipe
 *     (`.delete().eq("owner_id", ...)` zonder id-filter).
 *  3. FIFO-volgorde en per-entiteit operaties op de juiste tabellen.
 *  4. Foutafhandeling: attempts/lastError worden bijgehouden, retry lukt daarna.
 *  5. Outbox van gebruiker B wordt nooit aangeraakt bij een flush van A.
 *  6. `pullListsFromServer` filtert expliciet op `owner_id` en mapt naar domeintypes.
 *
 * Uitvoeren met: `npm run verify:data`
 * (rolldown bundelt dit bundel naar een tijdelijk bestand, node voert het uit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import {
  loadLists,
  saveLists,
  loadQueue,
  saveQueue,
  clearUserData,
  loadSyncMeta,
} from "../src/lib/storage";
import type { StorageBackend } from "../src/lib/storage";
import { flushOutbox, pullListsFromServer, backoffMs } from "../src/lib/sync";
import { isExactTitleMatch } from "../src/lib/utils";
import { type OutboxEntry, type OutboxOpPayload } from "../src/types/sync";
import type { List, ListItem } from "../src/types/app";

// ---------------------------------------------------------------------------
// Test-helpers
// ---------------------------------------------------------------------------

function memoryStorage(): StorageBackend {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

interface Call {
  table: string;
  op: string;
  filters: Array<[string, unknown]>;
  /** Gesorteerde kolommen als "kolom:ascending"-paren. */
  orders: string[];
  row: unknown;
}

interface FauxClientOptions {
  /** Retourneert `true` wanneer deze call moet falen. */
  shouldFail?: (call: Call) => boolean;
  /** Data die `select` teruggeeft (voor pull-tests). */
  selectData?: unknown;
  /**
   * Bestaan de functies uit supabase/reorder.sql? Standaard niet (zoals vóór
   * het uitvoeren van het script): de app valt dan terug op per-item-updates.
   */
  rpcAvailable?: boolean;
}

/** Nep-Supabase-client die alle calls registreert en optioneel faalt. */
function makeFauxClient(options: FauxClientOptions = {}): {
  calls: Call[];
  backend: {
    from: (table: string) => unknown;
    rpc: (fn: string, args: unknown) => Promise<unknown>;
  };
} {
  const calls: Call[] = [];

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const orders: string[] = [];
    let op = "select";
    let row: unknown = null;

    const record = (): Promise<{
      data: unknown;
      error: { message: string } | null;
    }> => {
      const call: Call = {
        table,
        op,
        filters: [...filters],
        orders: [...orders],
        row,
      };
      calls.push(call);
      const fail = options.shouldFail ? options.shouldFail(call) : false;
      return Promise.resolve({
        data: op === "select" ? (options.selectData ?? []) : null,
        error: fail
          ? { message: `fake-failure:${call.op}:${call.table}` }
          : null,
      });
    };

    let chain: {
      insert: (r: unknown) => Promise<unknown>;
      update: (r: unknown) => typeof chain;
      delete: () => typeof chain;
      select: (cols: unknown) => typeof chain;
      eq: (key: string, value: unknown) => typeof chain;
      in: (key: string, values: unknown) => typeof chain;
      order: (column: string, opts?: { ascending?: boolean }) => typeof chain;
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected: (e: unknown) => unknown,
      ) => Promise<unknown>;
    };

    chain = {
      insert: (r: unknown) => {
        op = "insert";
        row = r;
        return record();
      },
      update: (r: unknown) => {
        op = "update";
        row = r;
        return chain;
      },
      delete: () => {
        op = "delete";
        row = null;
        return chain;
      },
      select: (cols: unknown) => {
        op = "select";
        row = cols;
        return chain;
      },
      in: (key: string, values: unknown) => {
        filters.push([`${key}:in`, values]);
        return chain;
      },
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return chain;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orders.push(`${column}:${opts?.ascending === false ? "desc" : "asc"}`);
        return chain;
      },
      then: (onFulfilled, onRejected) => record().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const rpc = (fn: string, args: unknown) => {
    const call: Call = {
      table: fn,
      op: "rpc",
      filters: [],
      orders: [],
      row: args,
    };
    calls.push(call);
    if (!options.rpcAvailable) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      });
    }
    const fail = options.shouldFail ? options.shouldFail(call) : false;
    return Promise.resolve({
      data: null,
      error: fail ? { message: `fake-failure:rpc:${fn}` } : null,
    });
  };

  return { calls, backend: { from, rpc } };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  throw new Error(`FAIL: ${message}`);
}

function entry(payload: OutboxOpPayload): OutboxEntry {
  return {
    ...payload,
    opId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
}

function list(id: string, title: string): List {
  return { id, title, createdAt: new Date().toISOString(), items: [] };
}

function item(id: string, listId: string, text: string): ListItem {
  return {
    id,
    listId,
    text,
    done: false,
    position: 0,
    createdAt: new Date().toISOString(),
  };
}

const client = (backend: unknown) => backend as SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// 1. Per-user storage-isolatie
// ---------------------------------------------------------------------------

async function testPerUserStorage(): Promise<void> {
  const mem = memoryStorage();
  saveLists("userA", [list("L1", "A-lijst")], mem);
  saveLists("userB", [list("L2", "B-lijst")], mem);

  const a = loadLists("userA", mem);
  const b = loadLists("userB", mem);
  assert(a !== null && a[0]?.title === "A-lijst", "A ziet eigen lijst");
  assert(b !== null && b[0]?.title === "B-lijst", "B ziet eigen lijst");

  clearUserData("userA", mem);
  assert(loadLists("userA", mem) === null, "clearUserData wist A's cache");
  assert(
    loadLists("userB", mem)?.[0]?.title === "B-lijst",
    "B's data blijft onaangetast na A uit te loggen",
  );
}

// ---------------------------------------------------------------------------
// 2. Outbox-drain: per-entiteit, FIFO, geen bulk-wipe
// ---------------------------------------------------------------------------

async function testOutboxPerEntityNoBulkWipe(): Promise<void> {
  const mem = memoryStorage();
  const faux = makeFauxClient();
  const i1 = item("I1", "L1", "melk");

  saveQueue(
    "userA",
    [
      entry({ type: "list.create", listId: "L1", title: "Boodschappen" }),
      entry({ type: "item.create", item: i1 }),
      // Een al bestaand item (I3): een update van I1 zelf zou nu met de
      // create worden samengevoegd (§7.3, zie testCompactionBeforeFlush).
      entry({
        type: "item.update",
        item: { ...item("I3", "L1", "brood"), done: true },
      }),
      entry({ type: "item.delete", itemId: "I2", listId: "L1" }),
      entry({ type: "list.delete", listId: "L1" }),
    ],
    mem,
  );

  const result = await flushOutbox("userA", client(faux.backend), mem);

  assert(result.ok === true, "drain van 5 operaties slaagt");
  assert(result.syncedCount === 5, "alle 5 operaties verwerkt");
  assert(loadQueue("userA", mem).length === 0, "outbox is leeg na succes");

  const ops = faux.calls.map((c) => `${c.op}:${c.table}`);
  assert(
    JSON.stringify(ops) ===
      JSON.stringify([
        "insert:lists",
        "insert:list_items",
        "update:list_items",
        "delete:list_items",
        "delete:lists",
      ]),
    `FIFO per-entiteit operaties (kreeg: ${ops.join(", ")})`,
  );

  // Elke delete heeft een id-filter; een bulk-wipe
  // (`.delete().eq("owner_id", ...)` ZONDER id-filter) komt NOOIT voor.
  const deletes = faux.calls.filter((c) => c.op === "delete");
  assert(deletes.length === 2, "twee delete-operaties, geen bulk-wipe");
  for (const d of deletes) {
    assert(
      d.filters.some(([key]) => key === "id"),
      `delete heeft altijd een id-filter (kreeg: ${JSON.stringify(d.filters)})`,
    );
  }
  assert(
    !deletes.some(
      (d) =>
        d.filters.length === 1 &&
        d.filters[0]?.[0] === "owner_id" &&
        d.filters[0]?.[1] === "userA",
    ),
    "geen .delete().eq(owner_id) zonder id-filter (oud bulk-wipe patroon)",
  );
}

// ---------------------------------------------------------------------------
// 3. Foutafhandeling: attempts + lastError, daarna retry slaagt
// ---------------------------------------------------------------------------

async function testFailureRetry(): Promise<void> {
  const mem = memoryStorage();
  saveQueue(
    "userA",
    [entry({ type: "list.create", listId: "L1", title: "X" })],
    mem,
  );

  const failing = makeFauxClient({
    shouldFail: (call) => call.op === "insert",
  });
  const first = await flushOutbox("userA", client(failing.backend), mem);
  assert(first.ok === false, "eerste poging faalt bij offline");
  assert(first.error !== null, "foutmelding wordt teruggegeven");

  const queued = loadQueue("userA", mem);
  assert(queued.length === 1, "gefaalde operatie blijft in de wachtrij");
  const failedEntry = queued[0];
  if (failedEntry === undefined) throw new Error("FAIL: entry bestaat");
  assert(failedEntry.attempts === 1, "attempts wordt verhoogd naar 1");
  assert(failedEntry.lastError !== null, "lastError wordt gezet");
  assert(
    loadSyncMeta("userA", mem).lastError !== null,
    "sync-meta onthoudt de fout voor de UI",
  );

  const ok = makeFauxClient();
  const second = await flushOutbox("userA", client(ok.backend), mem);
  assert(second.ok === true, "retry slaagt zodra de verbinding er is");
  assert(loadQueue("userA", mem).length === 0, "outbox leeg na retry");
  assert(
    loadSyncMeta("userA", mem).lastError === null &&
      loadSyncMeta("userA", mem).lastSyncedAt !== null,
    "meta gereset + lastSyncedAt gezet na succesvolle retry",
  );
}

// ---------------------------------------------------------------------------
// 4. Cross-user: flush van A raakt outbox van B nooit
// ---------------------------------------------------------------------------

async function testCrossUserQueueIsolation(): Promise<void> {
  const mem = memoryStorage();
  saveQueue(
    "userB",
    [entry({ type: "list.create", listId: "LB", title: "B's lijst" })],
    mem,
  );

  const faux = makeFauxClient();
  await flushOutbox("userA", client(faux.backend), mem);

  assert(loadQueue("userA", mem).length === 0, "A's (lege) queue onveranderd");
  assert(loadQueue("userB", mem).length === 1, "B's queue blijft onaangetast");
  assert(
    faux.calls.every((c) => !JSON.stringify(c.row).includes("LB")),
    "geen B-data in de calls van A's run",
  );
}

// ---------------------------------------------------------------------------
// 5. pullListsFromServer: expliciete owner_id-filter + domeinmapping
// ---------------------------------------------------------------------------

async function testPullExplicitOwnerFilter(): Promise<void> {
  const mem = memoryStorage();
  const serverRows = [
    {
      id: "L1",
      title: "Serverlijst",
      created_at: "2026-01-01T00:00:00.000Z",
      position: 0,
      list_items: [
        {
          id: "I1",
          list_id: "L1",
          text: "server item",
          done: false,
          position: 3,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "I2",
          list_id: "L1",
          text: "eerste",
          done: true,
          position: 1,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  ];

  const faux = makeFauxClient({ selectData: serverRows });
  const { data, error } = await pullListsFromServer(
    "userA",
    client(faux.backend),
  );

  assert(error === null, "pull zonder fout");
  assert(data.length === 1 && data[0]?.title === "Serverlijst", "lijst gemapt");
  assert(
    data[0]?.items.map((i) => i.text).join(",") === "eerste,server item",
    "items gesorteerd op position (1,3)",
  );

  const select = faux.calls.find((c) => c.op === "select");
  assert(
    select !== undefined &&
      select.filters.some(
        ([key, value]) => key === "owner_id" && value === "userA",
      ),
    "pull filtert expliciet op owner_id = auth.uid()",
  );

  // Defensief: een gefaalde pull geeft lege data + foutmelding, geen crash.
  const fauxErr = makeFauxClient({ shouldFail: (c) => c.op === "select" });
  const failed = await pullListsFromServer("userA", client(fauxErr.backend));
  assert(
    failed.error !== null && failed.data.length === 0,
    "failed pull is leeg + fout",
  );
  void mem;
}

// ---------------------------------------------------------------------------
// 6. backoff
// ---------------------------------------------------------------------------

function testBackoff(): void {
  assert(backoffMs(0) === 1000, "backoff start op 1s");
  assert(backoffMs(1) === 2000, "backoff verdubbelt per attempt");
  assert(backoffMs(10) === 60000, "backoff is beperkt tot 60s");
}

// ---------------------------------------------------------------------------
// 7. Reorder-operaties: schrijft position = index, gefilterd op eigenaar
// ---------------------------------------------------------------------------

async function testReorderOperations(): Promise<void> {
  const mem = memoryStorage();
  const faux = makeFauxClient();

  saveQueue(
    "userA",
    [
      entry({ type: "item.reorder", listId: "L1", itemIds: ["I2", "I1"] }),
      entry({ type: "list.reorder", listIds: ["L2", "L1"] }),
    ],
    mem,
  );

  const result = await flushOutbox("userA", client(faux.backend), mem);
  assert(result.ok === true, "reorder-operaties slagen");
  assert(result.syncedCount === 2, "beide reorder-operaties verwerkt");

  // item.reorder: twee updates, position 0 en 1, gefilterd op list_id.
  const itemUpdates = faux.calls.filter(
    (c) => c.op === "update" && c.table === "list_items",
  );
  assert(itemUpdates.length === 2, "item.reorder doet één update per item");
  const itemPositions = itemUpdates.map((c) => {
    const row = c.row as { position: number };
    return row.position;
  });
  assert(
    JSON.stringify(itemPositions) === JSON.stringify([0, 1]),
    "item.reorder wijst position = index toe (0,1)",
  );
  for (const u of itemUpdates) {
    assert(
      u.filters.some(([k]) => k === "list_id"),
      "item.reorder filtert op list_id",
    );
  }

  // list.reorder: update per lijst, gefilterd op owner_id (cross-user safe).
  const listUpdates = faux.calls.filter(
    (c) => c.op === "update" && c.table === "lists",
  );
  assert(listUpdates.length === 2, "list.reorder doet één update per lijst");
  const listPositions = listUpdates.map(
    (c) => (c.row as { position: number }).position,
  );
  assert(
    JSON.stringify(listPositions) === JSON.stringify([0, 1]),
    "list.reorder wijst position = index toe (0,1)",
  );
  for (const u of listUpdates) {
    assert(
      u.filters.some(([k, v]) => k === "owner_id" && v === "userA"),
      "list.reorder filtert op owner_id (geen cross-user lek)",
    );
  }
}

// ---------------------------------------------------------------------------
// 8. pull sorteert lijsten op position (created_at als tiebreak)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Samenvoegen vóór het versturen (§7.3)
// ---------------------------------------------------------------------------

async function testCompactionBeforeFlush(): Promise<void> {
  const mem = memoryStorage();
  // Na het uitvoeren van supabase/reorder.sql: de reorder is één rpc-call.
  const faux = makeFauxClient({ rpcAvailable: true });
  const i1 = item("I1", "L1", "melk");
  const i2 = item("I2", "L1", "brood");

  saveQueue(
    "userA",
    [
      entry({ type: "item.create", item: i1 }),
      entry({ type: "item.update", item: { ...i1, done: true } }),
      entry({
        type: "item.update",
        item: { ...i1, done: true, text: "havermelk" },
      }),
      entry({ type: "item.create", item: i2 }),
      entry({ type: "item.delete", itemId: "I2", listId: "L1" }),
      entry({ type: "item.reorder", listId: "L1", itemIds: ["I1"] }),
      entry({ type: "item.reorder", listId: "L1", itemIds: ["I1"] }),
    ],
    mem,
  );

  const result = await flushOutbox("userA", client(faux.backend), mem);
  assert(result.ok, "samengevoegde flush slaagt");
  assert(
    result.syncedCount === 2,
    `2 operaties na samenvoegen (kreeg ${result.syncedCount})`,
  );

  const ops = faux.calls.map((c) => `${c.op}:${c.table}`);
  assert(
    JSON.stringify(ops) ===
      JSON.stringify(["insert:list_items", "rpc:reorder_items"]),
    `één insert met de eindstand + één reorder (kreeg: ${ops.join(", ")})`,
  );
  const inserted = faux.calls[0]?.row as { text?: string; done?: boolean };
  assert(
    inserted.text === "havermelk" && inserted.done === true,
    "de insert bevat de laatste tekst en status",
  );
  assert(
    !faux.calls.some((c) => c.op === "delete"),
    "aangemaakt én verwijderd item komt nooit op de server",
  );
  assert(
    loadQueue("userA", mem).length === 0,
    "outbox leeg na samenvoegen + flush",
  );

  // Een gefaalde create (kan na een timeout tóch op de server staan) wordt
  // niet samengevoegd: de delete blijft en gaat mee.
  const mem2 = memoryStorage();
  const faux2 = makeFauxClient();
  saveQueue(
    "userA",
    [
      {
        ...entry({ type: "item.create", item: i2 }),
        attempts: 1,
        lastError: "x",
      },
      entry({ type: "item.delete", itemId: "I2", listId: "L1" }),
    ],
    mem2,
  );
  await flushOutbox("userA", client(faux2.backend), mem2);
  assert(
    faux2.calls.map((c) => c.op).join(",") === "insert,delete",
    "gefaalde create blijft staan; de delete gaat mee",
  );
}

// ---------------------------------------------------------------------------
// Wachtrij na een run: verstuurd eruit, tussendoor toegevoegd blijft
// ---------------------------------------------------------------------------

async function testFlushSettlesQueue(): Promise<void> {
  // (a) Fout ná een geslaagde operatie: de geslaagde komt niet terug.
  const mem = memoryStorage();
  saveQueue(
    "userA",
    [
      entry({ type: "list.create", listId: "L1", title: "X" }),
      entry({ type: "item.create", item: item("I1", "L1", "melk") }),
    ],
    mem,
  );
  const failing = makeFauxClient({
    shouldFail: (call) => call.table === "list_items",
  });
  const first = await flushOutbox("userA", client(failing.backend), mem);
  assert(!first.ok, "tweede operatie faalt");
  const queued = loadQueue("userA", mem);
  assert(
    queued.length === 1 && queued[0]?.type === "item.create",
    `alleen de gefaalde operatie blijft staan (kreeg: ${queued.map((e) => e.type).join(", ")})`,
  );

  const ok = makeFauxClient();
  await flushOutbox("userA", client(ok.backend), mem);
  assert(
    ok.calls.map((c) => `${c.op}:${c.table}`).join(",") === "insert:list_items",
    "de retry verstuurt de al geslaagde list.create niet opnieuw",
  );

  // (b) Een wijziging tíjdens het versturen blijft in de wachtrij.
  const mem2 = memoryStorage();
  saveQueue(
    "userA",
    [entry({ type: "list.create", listId: "L2", title: "Y" })],
    mem2,
  );
  let added = false;
  const midway = makeFauxClient({
    shouldFail: () => {
      if (!added) {
        added = true;
        const now = loadQueue("userA", mem2);
        saveQueue(
          "userA",
          [...now, entry({ type: "list.update", listId: "L2", title: "Z" })],
          mem2,
        );
      }
      return false;
    },
  });
  const result = await flushOutbox("userA", client(midway.backend), mem2);
  const rest = loadQueue("userA", mem2);
  assert(result.ok, "run slaagt");
  assert(
    rest.length === 1 && rest[0]?.type === "list.update",
    "wijziging tijdens het versturen gaat niet verloren",
  );
  assert(
    result.queue.length === 1,
    "het resultaat meldt de resterende wachtrij",
  );
}

// ---------------------------------------------------------------------------
// Gebundelde requests (§7.3)
// ---------------------------------------------------------------------------

async function testBatchedRequests(): Promise<void> {
  // 10 nieuwe items (zoals addItem ze maakt: steeds één lager) → 1 insert.
  const mem = memoryStorage();
  const faux = makeFauxClient();
  const created = Array.from({ length: 10 }, (_, i) =>
    entry({
      type: "item.create",
      item: { ...item(`N${i}`, "L1", `item ${i}`), position: -1 - i },
    }),
  );
  saveQueue("userA", created, mem);
  const result = await flushOutbox("userA", client(faux.backend), mem);
  assert(result.ok && result.syncedCount === 10, "10 creates verwerkt");
  assert(
    faux.calls.length === 1,
    `10 nieuwe items = 1 request (kreeg ${faux.calls.length})`,
  );
  const rows = faux.calls[0]?.row as Array<{ id: string; position: number }>;
  assert(
    Array.isArray(rows) && rows.length === 10 && rows[9]?.position === -10,
    "de insert bevat alle 10 rijen met hun positie",
  );

  // "Verwijder afgevinkt": deletes van één lijst → 1 delete, met id- én lijstfilter.
  const mem2 = memoryStorage();
  const faux2 = makeFauxClient();
  saveQueue(
    "userA",
    [
      entry({ type: "item.delete", itemId: "D1", listId: "L1" }),
      entry({ type: "item.delete", itemId: "D2", listId: "L1" }),
      entry({ type: "item.delete", itemId: "D3", listId: "L2" }),
    ],
    mem2,
  );
  await flushOutbox("userA", client(faux2.backend), mem2);
  assert(faux2.calls.length === 2, "deletes per lijst gebundeld (2 requests)");
  const bundled = faux2.calls[0];
  assert(
    !!bundled &&
      bundled.filters.some(
        ([key, value]) =>
          key === "id:in" && JSON.stringify(value) === '["D1","D2"]',
      ) &&
      bundled.filters.some(
        ([key, value]) => key === "list_id" && value === "L1",
      ),
    "gebundelde delete: id-filter (geen bulk-wipe) + lijstfilter",
  );

  // Mislukte bundel: alle operaties gemarkeerd, niets verstuurd uit de wachtrij.
  const mem3 = memoryStorage();
  saveQueue("userA", created.slice(0, 3), mem3);
  const failing = makeFauxClient({ shouldFail: () => true });
  const failed = await flushOutbox("userA", client(failing.backend), mem3);
  const left = loadQueue("userA", mem3);
  assert(
    !failed.ok && failing.calls.length === 1,
    "één mislukt gebundeld request",
  );
  assert(
    left.length === 3 &&
      left.every((e) => e.attempts === 1 && e.lastError !== null),
    "alle 3 operaties uit de bundel staan gemarkeerd in de wachtrij",
  );
}

// ---------------------------------------------------------------------------
// Volgorde via de databasefunctie, met terugval (§7.3, supabase/reorder.sql)
// ---------------------------------------------------------------------------

async function testReorderViaRpc(): Promise<void> {
  const reorders = (): OutboxEntry[] => [
    entry({ type: "item.reorder", listId: "L1", itemIds: ["I3", "I1", "I2"] }),
    entry({ type: "list.reorder", listIds: ["L2", "L1"] }),
  ];

  // Functies bestaan: één rpc-call per reorder, geen updates per item.
  const mem = memoryStorage();
  const faux = makeFauxClient({ rpcAvailable: true });
  saveQueue("userA", reorders(), mem);
  const result = await flushOutbox("userA", client(faux.backend), mem);
  assert(result.ok, "reorders via rpc slagen");
  assert(
    faux.calls.map((c) => `${c.op}:${c.table}`).join(",") ===
      "rpc:reorder_items,rpc:reorder_lists",
    "één rpc-call per reorder, geen per-item-updates",
  );
  assert(
    JSON.stringify(faux.calls[0]?.row) ===
      JSON.stringify({ p_list_id: "L1", p_item_ids: ["I3", "I1", "I2"] }),
    "reorder_items krijgt lijst-id en volgorde",
  );
  assert(
    JSON.stringify(faux.calls[1]?.row) ===
      JSON.stringify({ p_list_ids: ["L2", "L1"] }),
    "reorder_lists krijgt de lijstvolgorde",
  );

  // Functies bestaan (nog) niet: terugval, en daarna niet steeds opnieuw proberen.
  const mem2 = memoryStorage();
  const missing = makeFauxClient();
  saveQueue("userA", reorders(), mem2);
  const fallback = await flushOutbox("userA", client(missing.backend), mem2);
  assert(fallback.ok, "terugval op per-item-updates slaagt");
  const rpcCalls = missing.calls.filter((c) => c.op === "rpc").length;
  const updates = missing.calls.filter((c) => c.op === "update").length;
  assert(
    rpcCalls === 1,
    `één mislukte rpc-poging, daarna onthouden (kreeg ${rpcCalls})`,
  );
  assert(updates === 5, `terugval: 3 + 2 updates (kreeg ${updates})`);

  // Een echte fout van de functie: geen terugval, wel een NL-fout + retry.
  const mem3 = memoryStorage();
  const failing = makeFauxClient({
    rpcAvailable: true,
    shouldFail: (call) => call.op === "rpc",
  });
  saveQueue("userA", reorders().slice(0, 1), mem3);
  const failed = await flushOutbox("userA", client(failing.backend), mem3);
  assert(
    !failed.ok && failed.error !== null,
    "rpc-fout → mislukt met NL-tekst",
  );
  assert(
    !failing.calls.some((c) => c.op === "update"),
    "bij een echte fout geen terugval (anders half opgeslagen)",
  );
  assert(
    loadQueue("userA", mem3)[0]?.attempts === 1,
    "reorder blijft gemarkeerd staan",
  );
}

async function testPullOrder(): Promise<void> {
  const faux = makeFauxClient({
    selectData: [
      {
        id: "L1",
        title: "A",
        created_at: "2026-01-01T00:00:00Z",
        position: 1,
        list_items: [],
      },
      {
        id: "L2",
        title: "B",
        created_at: "2026-01-01T00:00:00Z",
        position: 0,
        list_items: [],
      },
    ],
  });
  const { data, error } = await pullListsFromServer(
    "userA",
    client(faux.backend),
  );
  assert(error === null, "pull orderen zonder fout");
  assert(data.length === 2, "beide lijsten binnengehaald");

  const select = faux.calls.find((c) => c.op === "select");
  assert(
    select !== undefined &&
      JSON.stringify(select.orders) ===
        JSON.stringify(["position:asc", "created_at:desc"]),
    `pull sorteert op position (created_at als tiebreak; kreeg: ${JSON.stringify(
      select?.orders,
    )})`,
  );
}

// ---------------------------------------------------------------------------
// 9. Titelvalidatie verwijderen (AGENTS.md §8.3): exact + hoofdlettergevoelig
// ---------------------------------------------------------------------------

function testExactTitleMatch(): void {
  const title = "Boodschappen";
  assert(isExactTitleMatch("Boodschappen", title), "exacte titel matcht");
  assert(
    isExactTitleMatch("  Boodschappen  ", title),
    "omringende spaties worden getrimd",
  );
  assert(
    !isExactTitleMatch("boodschappen", title),
    "kleine letter matcht NIET (hoofdlettergevoelig)",
  );
  assert(!isExactTitleMatch("BOODSCHAPPEN", title), "hoofdletters matcht NIET");
  assert(!isExactTitleMatch("", title), "lege invoer matcht niet");
  assert(
    !isExactTitleMatch("Boodschappen extra", title),
    "extra tekst matcht niet",
  );
  assert(!isExactTitleMatch("  ", "  "), "spaties-only matcht niet");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await testPerUserStorage();
  await testOutboxPerEntityNoBulkWipe();
  await testFailureRetry();
  await testCrossUserQueueIsolation();
  await testPullExplicitOwnerFilter();
  testBackoff();
  await testReorderOperations();
  await testPullOrder();
  await testCompactionBeforeFlush();
  await testFlushSettlesQueue();
  await testBatchedRequests();
  await testReorderViaRpc();
  testExactTitleMatch();

  console.log(
    `${passed} checks geslaagd${failed ? `, ${failed} gefaald` : ""}`,
  );
  if (failed > 0) process.exit(1);
}

void main();
