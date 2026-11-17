import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "./database.types";
import { ACCESS_DENIED, DUPLICATE_ERROR, NETWORK_ERROR } from "./errorMessages";
import { createOutboxEntry } from "./outbox";
import { loadQueue, saveQueue, type StorageBackend } from "./storage";
import { flushOutbox } from "./sync";
import type { ListItem } from "../types/app";
import type { OutboxEntry, OutboxOpPayload } from "../types/sync";

const USER = "user-a";

type Row = { id: string } & Record<string, unknown>;
type PgError = { message: string; code: string };

interface Request {
  table: string;
  op: "insert" | "upsert" | "update";
  rows: Row[];
  options?: { onConflict?: string; ignoreDuplicates?: boolean };
}

interface FakeServerOptions {
  /**
   * Gedraagt de server zich als een gewone insert, ook bij een upsert? Zo
   * testen we het vangnet voor 23505 (bv. een oude client-versie, of een
   * upsert die onder RLS anders uitpakt).
   */
  strictInsert?: boolean;
  /** Fout die de server geeft voor deze rij (in plaats van hem op te slaan). */
  rejectRow?: (table: string, row: Row) => PgError | null;
  /** Slaat de rijen op, maar het antwoord komt nooit aan (timeout, kill). */
  loseResponse?: (request: Request) => boolean;
}

const duplicate = (table: string): PgError => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${table}_pkey"`,
});

/** Nep-Supabase met echte rijen per tabel, zodat duplicaten kunnen ontstaan. */
function fakeServer(options: FakeServerOptions = {}) {
  const tables = new Map<string, Map<string, Row>>([
    ["lists", new Map()],
    ["list_items", new Map()],
  ]);
  const requests: Request[] = [];

  const write = (request: Request): Promise<{ error: PgError | null }> => {
    requests.push(request);
    const table = tables.get(request.table)!;
    const ignore =
      request.op === "upsert" &&
      request.options?.onConflict === "id" &&
      request.options.ignoreDuplicates === true &&
      !options.strictInsert;

    // Eén statement: bij een fout wordt niets opgeslagen (atomair).
    for (const row of request.rows) {
      const rejected = options.rejectRow?.(request.table, row);
      if (rejected) return Promise.resolve({ error: rejected });
      if (table.has(row.id) && !ignore) {
        return Promise.resolve({ error: duplicate(request.table) });
      }
    }
    for (const row of request.rows) {
      if (!table.has(row.id)) table.set(row.id, { ...row });
    }
    if (options.loseResponse?.(request)) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return Promise.resolve({ error: null });
  };

  const rowsOf = (value: Row | Row[]): Row[] =>
    Array.isArray(value) ? value : [value];

  const from = (table: string) => ({
    insert: (value: Row | Row[]) =>
      write({ table, op: "insert", rows: rowsOf(value) }),
    upsert: (value: Row | Row[], opts: NonNullable<Request["options"]>) =>
      write({ table, op: "upsert", rows: rowsOf(value), options: opts }),
    update: (patch: Record<string, unknown>) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        then: (
          resolve: (v: { error: PgError | null }) => unknown,
          reject: (e: unknown) => unknown,
        ) => {
          requests.push({ table, op: "update", rows: [] });
          const row = tables.get(table)!.get(String(filters.id));
          if (row) Object.assign(row, patch);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  });

  return {
    tables,
    requests,
    client: { from } as unknown as SupabaseClient<Database>,
    seed(table: string, row: Row) {
      tables.get(table)!.set(row.id, row);
    },
  };
}

function memoryStorage(): StorageBackend {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  };
}

const item = (id: string, text = id): ListItem => ({
  id,
  listId: "L1",
  text,
  done: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const entry = (op: OutboxOpPayload): OutboxEntry => createOutboxEntry(op);

/** Zoals de outbox hem na een eerdere mislukte poging bewaart. */
const failedBefore = (op: OutboxOpPayload, lastError: string): OutboxEntry => ({
  ...createOutboxEntry(op),
  attempts: 3,
  lastError,
});

const createItem = (id: string) =>
  entry({ type: "item.create", item: item(id) });

describe("flushOutbox — idempotente creates (#4)", () => {
  it("een item.create die al aankwam (antwoord verloren) slaagt bij de retry", async () => {
    let lost = false;
    const server = fakeServer({
      loseResponse: () => {
        if (lost) return false;
        lost = true;
        return true;
      },
    });
    const mem = memoryStorage();
    saveQueue(USER, [createItem("I1")], mem);

    const first = await flushOutbox(USER, server.client, mem);
    expect(first.ok).toBe(false);
    expect(first.error).toBe(NETWORK_ERROR);
    expect(server.tables.get("list_items")!.has("I1")).toBe(true);

    const retry = await flushOutbox(USER, server.client, mem);
    expect(retry).toMatchObject({ ok: true, queuedCount: 0 });
    expect(loadQueue(USER, mem)).toEqual([]);
    expect(server.tables.get("list_items")!.size).toBe(1);
  });

  it("een gebundelde item.create die al aankwam slaagt bij de retry", async () => {
    let lost = false;
    const server = fakeServer({
      loseResponse: () => {
        if (lost) return false;
        lost = true;
        return true;
      },
    });
    const mem = memoryStorage();
    saveQueue(USER, [createItem("I1"), createItem("I2")], mem);

    expect((await flushOutbox(USER, server.client, mem)).ok).toBe(false);
    const retry = await flushOutbox(USER, server.client, mem);

    expect(retry).toMatchObject({ ok: true, syncedCount: 2, queuedCount: 0 });
    // Beide pogingen gingen als één gebundeld request.
    expect(server.requests.map((r) => r.rows.length)).toEqual([2, 2]);
    expect(server.tables.get("list_items")!.size).toBe(2);
  });

  it("een bundel waarvan een deel al bestaat voegt de rest toe en slaagt", async () => {
    const server = fakeServer();
    server.seed("list_items", { id: "I2", text: "bestaand" });
    const mem = memoryStorage();
    saveQueue(USER, ["I1", "I2", "I3"].map(createItem), mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(result).toMatchObject({ ok: true, syncedCount: 3, queuedCount: 0 });
    expect(server.requests).toHaveLength(1);
    expect([...server.tables.get("list_items")!.keys()].sort()).toEqual([
      "I1",
      "I2",
      "I3",
    ]);
    // Het bestaande item wordt niet overschreven.
    expect(server.tables.get("list_items")!.get("I2")!.text).toBe("bestaand");
  });

  it("een list.create voor een bestaande lijst slaagt zonder de titel te overschrijven", async () => {
    const server = fakeServer();
    server.seed("lists", { id: "L1", owner_id: USER, title: "Nieuwe titel" });
    const mem = memoryStorage();
    saveQueue(
      USER,
      [entry({ type: "list.create", listId: "L1", title: "Oude titel" })],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(true);
    expect(server.tables.get("lists")!.get("L1")!.title).toBe("Nieuwe titel");
  });

  it("creates gaan als upsert op id met ignoreDuplicates; lijsten met de eigen owner_id", async () => {
    const server = fakeServer();
    const mem = memoryStorage();
    saveQueue(
      USER,
      [
        entry({ type: "list.create", listId: "L1", title: "X" }),
        createItem("I1"),
        entry({ type: "list.create", listId: "L2", title: "Y" }),
        createItem("I2"),
        createItem("I3"),
      ],
      mem,
    );

    await flushOutbox(USER, server.client, mem);

    expect(server.requests).toHaveLength(4);
    for (const request of server.requests) {
      expect(request.op).toBe("upsert");
      expect(request.options).toEqual({
        onConflict: "id",
        ignoreDuplicates: true,
      });
    }
    const lists = server.requests.filter((r) => r.table === "lists");
    expect(lists.flatMap((r) => r.rows.map((row) => row.owner_id))).toEqual([
      USER,
      USER,
    ]);
  });
});

describe("flushOutbox — 23505 op een create telt als gelukt (#5)", () => {
  it("een vastgelopen item.create aan de kop verdwijnt en de rest gaat door", async () => {
    const server = fakeServer({ strictInsert: true });
    server.seed("list_items", { id: "I1", text: "melk" });
    const mem = memoryStorage();
    saveQueue(
      USER,
      [
        failedBefore(
          { type: "item.create", item: item("I1") },
          DUPLICATE_ERROR,
        ),
        entry({ type: "item.update", item: { ...item("I1"), done: true } }),
        createItem("I2"),
      ],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    expect(result).toMatchObject({ ok: true, syncedCount: 3, queuedCount: 0 });
    expect(loadQueue(USER, mem)).toEqual([]);
    expect(server.tables.get("list_items")!.get("I1")!.done).toBe(true);
    expect(server.tables.get("list_items")!.has("I2")).toBe(true);
  });

  it("een list.create die al bestaat telt als gelukt", async () => {
    const server = fakeServer({ strictInsert: true });
    server.seed("lists", { id: "L1", owner_id: USER, title: "X" });
    const mem = memoryStorage();
    saveQueue(
      USER,
      [
        failedBefore(
          { type: "list.create", listId: "L1", title: "X" },
          DUPLICATE_ERROR,
        ),
      ],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    expect(result).toMatchObject({ ok: true, queuedCount: 0 });
  });

  it("een bundel van 5 creates waarvan 2 bestaan: de 3 andere komen aan, de wachtrij is leeg", async () => {
    const server = fakeServer({ strictInsert: true });
    server.seed("list_items", { id: "I2", text: "bestaand" });
    server.seed("list_items", { id: "I4", text: "bestaand" });
    const mem = memoryStorage();
    saveQueue(USER, ["I1", "I2", "I3", "I4", "I5"].map(createItem), mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(result).toMatchObject({ ok: true, syncedCount: 5, queuedCount: 0 });
    // Eén mislukte bundel, daarna elke rij los.
    expect(server.requests.map((r) => r.rows.length)).toEqual([
      5, 1, 1, 1, 1, 1,
    ]);
    expect(server.tables.get("list_items")!.size).toBe(5);
    expect(server.tables.get("list_items")!.get("I4")!.text).toBe("bestaand");
  });

  it("bij een andere fout tijdens het los versturen wordt alleen die rij gemarkeerd", async () => {
    const server = fakeServer({
      strictInsert: true,
      rejectRow: (_table, row) =>
        row.id === "I3"
          ? { code: "42501", message: "new row violates row-level security" }
          : null,
    });
    server.seed("list_items", { id: "I1", text: "bestaand" });
    const mem = memoryStorage();
    saveQueue(USER, ["I1", "I2", "I3", "I4"].map(createItem), mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(ACCESS_DENIED);
    expect(result.syncedCount).toBe(2);
    const left = loadQueue(USER, mem);
    expect(
      left.map((e) => (e.type === "item.create" ? e.item.id : "")),
    ).toEqual(["I3", "I4"]);
    expect(left[0]).toMatchObject({ attempts: 1, lastError: ACCESS_DENIED });
    // Nog niet geprobeerd: ongemoeid.
    expect(left[1]).toMatchObject({ attempts: 0, lastError: null });
  });

  it("23505 op een andere constraint telt niet als gelukt", async () => {
    const server = fakeServer({
      rejectRow: () => ({
        code: "23505",
        message: 'duplicate key value violates unique constraint "other_key"',
      }),
    });
    const mem = memoryStorage();
    saveQueue(USER, [createItem("I1")], mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(false);
    expect(loadQueue(USER, mem)[0]).toMatchObject({
      attempts: 1,
      lastError: DUPLICATE_ERROR,
    });
  });

  it.each([
    ["RLS", { code: "42501", message: "new row violates row-level security" }],
    ["FK", { code: "23503", message: "violates foreign key constraint" }],
  ])(
    "andere fouten (%s) markeren de create nog steeds als mislukt",
    async (_, error) => {
      const server = fakeServer({ rejectRow: () => error });
      const mem = memoryStorage();
      saveQueue(USER, [createItem("I1"), createItem("I2")], mem);

      const result = await flushOutbox(USER, server.client, mem);

      expect(result.ok).toBe(false);
      // Geen los versturen: één request, de hele bundel gemarkeerd.
      expect(server.requests).toHaveLength(1);
      expect(loadQueue(USER, mem).map((e) => e.attempts)).toEqual([1, 1]);
    },
  );
});
