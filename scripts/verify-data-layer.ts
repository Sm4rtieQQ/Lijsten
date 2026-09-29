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
}

/** Nep-Supabase-client die alle calls registreert en optioneel faalt. */
function makeFauxClient(options: FauxClientOptions = {}): {
  calls: Call[];
  backend: { from: (table: string) => unknown };
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

  return { calls, backend: { from } };
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
      entry({ type: "item.update", item: { ...i1, done: true } }),
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
  testExactTitleMatch();

  console.log(
    `${passed} checks geslaagd${failed ? `, ${failed} gefaald` : ""}`,
  );
  if (failed > 0) process.exit(1);
}

void main();
