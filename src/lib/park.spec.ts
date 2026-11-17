import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "./database.types";
import { ACCESS_DENIED, CONNECTION_DROPPED } from "./errorMessages";
import {
  PARK_AFTER_ATTEMPTS,
  createOutboxEntry,
  isPermanentError,
  nextBatch,
  nextRetryAttempt,
  readyEntries,
} from "./outbox";
import { loadQueue, saveQueue, type StorageBackend } from "./storage";
import { flushOutbox } from "./sync";
import type { ListItem } from "../types/app";
import {
  isOutboxEntryArray,
  isParked,
  type OutboxEntry,
  type OutboxOpPayload,
} from "../types/sync";

/**
 * Permanente fouten blokkeren de wachtrij niet meer (#10): na
 * `PARK_AFTER_ATTEMPTS` pogingen wordt een blijvend geweigerde operatie
 * geparkeerd (bewaard, niet verwijderd) en gaat de rest door.
 */

const USER = "user-a";

type PgError = { message: string; code: string };

interface Sent {
  table: string;
  op: string;
  /** Ids van de rijen (create/delete) of het gefilterde id (update). */
  ids: string[];
}

/** Nep-Supabase die alles accepteert, behalve wat `reject` weigert. */
function fakeClient(reject: (sent: Sent) => PgError | null = () => null) {
  const sent: Sent[] = [];

  const respond = (request: Sent) => {
    const chain = {
      eq: (key: string, value: unknown) => {
        if (key === "id") request.ids = [String(value)];
        return chain;
      },
      in: (_key: string, values: string[]) => {
        request.ids = values;
        return chain;
      },
      abortSignal: () => chain,
      then: (
        resolve: (v: { error: PgError | null }) => unknown,
        rejectFn: (e: unknown) => unknown,
      ) => {
        sent.push(request);
        return Promise.resolve({ error: reject(request) }).then(
          resolve,
          rejectFn,
        );
      },
    };
    return chain;
  };

  const idsOf = (value: { id: string } | { id: string }[]): string[] =>
    (Array.isArray(value) ? value : [value]).map((row) => row.id);

  const from = (table: string) => ({
    upsert: (value: { id: string } | { id: string }[]) =>
      respond({ table, op: "upsert", ids: idsOf(value) }),
    update: () => respond({ table, op: "update", ids: [] }),
    delete: () => respond({ table, op: "delete", ids: [] }),
  });
  const rpc = (name: string, args: Record<string, unknown>) =>
    respond({
      table: name,
      op: "rpc",
      ids: (args.p_item_ids ?? args.p_list_ids ?? []) as string[],
    });

  return {
    sent,
    client: { from, rpc } as unknown as SupabaseClient<Database>,
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

const item = (id: string, listId = "L1"): ListItem => ({
  id,
  listId,
  text: id,
  done: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const entry = (op: OutboxOpPayload): OutboxEntry => createOutboxEntry(op);
const createItem = (id: string, listId = "L1") =>
  entry({ type: "item.create", item: item(id, listId) });
const updateItem = (id: string, listId = "L1") =>
  entry({ type: "item.update", item: item(id, listId) });

const FK: PgError = {
  code: "23503",
  message: 'insert or update violates foreign key constraint "list_items_fk"',
};
const RLS: PgError = {
  code: "42501",
  message: "new row violates row-level security policy",
};

/** Al zo vaak blijvend geweigerd dat de volgende weigering parkeert. */
const almostParked = (e: OutboxEntry): OutboxEntry => ({
  ...e,
  attempts: PARK_AFTER_ATTEMPTS - 1,
  lastError: ACCESS_DENIED,
});

const parked = (e: OutboxEntry): OutboxEntry => ({
  ...e,
  attempts: PARK_AFTER_ATTEMPTS,
  lastError: ACCESS_DENIED,
  lastCode: "42501",
  parkedAt: "2026-11-17T10:00:00.000Z",
});

const idOf = (e: OutboxEntry): string => {
  switch (e.type) {
    case "item.create":
    case "item.update":
      return e.item.id;
    case "item.delete":
      return e.itemId;
    case "list.reorder":
      return "order";
    case "item.reorder":
      return `order:${e.listId}`;
    default:
      return e.listId;
  }
};

describe("isPermanentError — permanent vs. tijdelijk (#10)", () => {
  it.each(["23503", "23502", "23514", "23505", "42501", "42P01", "22P02"])(
    "%s (de server weigert de operatie zelf) is permanent",
    (code) => expect(isPermanentError(code)).toBe(true),
  );
  it.each(["PGRST116", "PGRST204", "P0001"])(
    "%s (verzoek klopt niet) is permanent",
    (code) => expect(isPermanentError(code)).toBe(true),
  );
  it.each([
    [null, "netwerk/timeout, geen code"],
    ["PGRST000", "geen verbinding met de database"],
    ["PGRST003", "pool-timeout"],
    ["PGRST301", "JWT verlopen; na het verversen van de sessie lukt het"],
    ["PGRST303", "JWT-claims"],
    ["08006", "verbinding verbroken"],
    ["57014", "statement-timeout"],
    ["53300", "te veel verbindingen"],
    ["40001", "serialisatie"],
    ["XX000", "onbekend"],
  ])("%s (%s) is tijdelijk", (code, _why) =>
    expect(isPermanentError(code)).toBe(false),
  );
});

describe("flushOutbox — permanente fouten parkeren (#10)", () => {
  it("parkeert na PARK_AFTER_ATTEMPTS pogingen en verstuurt de rest alsnog", async () => {
    const server = fakeClient((s) => (s.ids.includes("I1") ? FK : null));
    const mem = memoryStorage();
    saveQueue(USER, [createItem("I1"), createItem("I2")], mem);

    // Eerst nog gewoon gemarkeerd (FIFO, backoff) zoals altijd.
    for (let i = 1; i < PARK_AFTER_ATTEMPTS; i += 1) {
      const run = await flushOutbox(USER, server.client, mem);
      expect(run.ok).toBe(false);
      expect(loadQueue(USER, mem).some(isParked)).toBe(false);
    }

    const result = await flushOutbox(USER, server.client, mem);

    expect(result).toMatchObject({ ok: true, parkedCount: 1, queuedCount: 1 });
    const left = loadQueue(USER, mem);
    expect(left.map(idOf)).toEqual(["I1"]);
    expect(left[0]).toMatchObject({
      attempts: PARK_AFTER_ATTEMPTS,
      lastCode: "23503",
    });
    expect(isParked(left[0]!)).toBe(true);
    expect(server.sent.at(-1)!.ids).toEqual(["I2"]);
  });

  it("een tijdelijke fout parkeert nooit, ook niet na veel pogingen", async () => {
    const server = fakeClient(() => ({
      code: "PGRST301",
      message: "JWT expired",
    }));
    const mem = memoryStorage();
    saveQueue(
      USER,
      [{ ...createItem("I1"), attempts: 10, lastError: CONNECTION_DROPPED }],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(false);
    expect(loadQueue(USER, mem).some(isParked)).toBe(false);
  });

  it("een mislukte bundel parkeert niets (de schuldige rij is onbekend)", async () => {
    const server = fakeClient(() => FK);
    const mem = memoryStorage();
    // Na netwerkfouten mogen ze weer samen; de bundel faalt dan permanent.
    const transient = (id: string): OutboxEntry => ({
      ...createItem(id),
      attempts: PARK_AFTER_ATTEMPTS + 1,
      lastError: CONNECTION_DROPPED,
    });
    saveQueue(USER, [transient("I1"), transient("I2")], mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(server.sent).toHaveLength(1);
    expect(server.sent[0]!.ids).toEqual(["I1", "I2"]);
    expect(result.ok).toBe(false);
    expect(loadQueue(USER, mem).some(isParked)).toBe(false);
  });

  it("een geparkeerde operatie wordt bij een gewone flush niet verstuurd", async () => {
    const server = fakeClient();
    const mem = memoryStorage();
    saveQueue(USER, [parked(createItem("I1")), createItem("I2")], mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(server.sent.map((s) => s.ids)).toEqual([["I2"]]);
    expect(result).toMatchObject({ ok: true, parkedCount: 1 });
    expect(loadQueue(USER, mem).map(idOf)).toEqual(["I1"]);
  });

  it("met retryParked gaat een geparkeerde operatie opnieuw en verdwijnt als hij lukt", async () => {
    const server = fakeClient();
    const mem = memoryStorage();
    saveQueue(USER, [parked(createItem("I1")), updateItem("I1")], mem);

    const result = await flushOutbox(USER, server.client, mem, {
      retryParked: true,
    });

    expect(result).toMatchObject({ ok: true, parkedCount: 0, queuedCount: 0 });
    expect(server.sent.map((s) => s.op)).toEqual(["upsert", "update"]);
    expect(loadQueue(USER, mem)).toEqual([]);
  });

  it("lukt een geparkeerde operatie bij retryParked weer niet, dan blijft hij geparkeerd en gaat de rest door", async () => {
    const server = fakeClient((s) => (s.ids.includes("I1") ? RLS : null));
    const mem = memoryStorage();
    saveQueue(USER, [parked(createItem("I1")), createItem("I2")], mem);

    const result = await flushOutbox(USER, server.client, mem, {
      retryParked: true,
    });

    expect(result).toMatchObject({ ok: true, parkedCount: 1, queuedCount: 1 });
    const [left] = loadQueue(USER, mem);
    expect(isParked(left!)).toBe(true);
    expect(left!.attempts).toBe(PARK_AFTER_ATTEMPTS + 1);
    expect(server.sent.map((s) => s.ids)).toEqual([["I1"], ["I2"]]);
  });

  it("ook een netwerkfout bij retryParked laat hem geparkeerd (blokkeert de rij niet)", async () => {
    const server = fakeClient((s) =>
      s.ids.includes("I1")
        ? { code: "PGRST000", message: "no connection" }
        : null,
    );
    const mem = memoryStorage();
    saveQueue(USER, [parked(createItem("I1")), createItem("I2")], mem);

    const result = await flushOutbox(USER, server.client, mem, {
      retryParked: true,
    });

    expect(result).toMatchObject({ ok: true, parkedCount: 1 });
    expect(isParked(loadQueue(USER, mem)[0]!)).toBe(true);
  });

  it("operaties op een geparkeerd item wachten erachter (nooit blind versturen)", async () => {
    const server = fakeClient((s) => (s.ids.includes("I1") ? RLS : null));
    const mem = memoryStorage();
    const del = entry({ type: "item.delete", itemId: "I1", listId: "L1" });
    saveQueue(
      USER,
      [almostParked(createItem("I1")), updateItem("I1"), del, createItem("I2")],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    // (De update valt bij het samenvoegen weg: de delete erna vervangt hem.)
    expect(result).toMatchObject({ ok: true, parkedCount: 1, queuedCount: 2 });
    // Alleen de create van I1 (geparkeerd) en I2 gingen de deur uit.
    expect(server.sent.map((s) => s.ids)).toEqual([["I1"], ["I2"]]);
    const left = loadQueue(USER, mem);
    expect(left.map((e) => e.type)).toEqual(["item.create", "item.delete"]);
    // De wachtende operaties zelf zijn niet geprobeerd en niet geparkeerd.
    expect(left.slice(1).every((e) => e.attempts === 0 && !isParked(e))).toBe(
      true,
    );
  });

  it("items van een geparkeerde lijst wachten; andere lijsten gaan door", async () => {
    const server = fakeClient((s) =>
      s.table === "lists" && s.ids.includes("L1") ? RLS : null,
    );
    const mem = memoryStorage();
    saveQueue(
      USER,
      [
        almostParked(entry({ type: "list.create", listId: "L1", title: "x" })),
        createItem("I1", "L1"),
        createItem("I2", "L2"),
        entry({ type: "list.reorder", listIds: ["L2", "L1"] }),
      ],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(true);
    expect(server.sent.map((s) => [s.table, s.ids])).toEqual([
      ["lists", ["L1"]],
      ["list_items", ["I2"]],
    ]);
    expect(loadQueue(USER, mem).map(idOf)).toEqual(["L1", "I1", "order"]);
  });

  it("de wachtende operaties gaan mee zodra de geparkeerde lukt", async () => {
    const server = fakeClient();
    const mem = memoryStorage();
    saveQueue(
      USER,
      [
        parked(entry({ type: "list.create", listId: "L1", title: "x" })),
        createItem("I1", "L1"),
      ],
      mem,
    );

    const result = await flushOutbox(USER, server.client, mem, {
      retryParked: true,
    });

    expect(result).toMatchObject({ ok: true, queuedCount: 0 });
    expect(server.sent.map((s) => s.table)).toEqual(["lists", "list_items"]);
  });

  it("een gewone (niet-parkeerbare) fout stopt de run nog steeds (FIFO)", async () => {
    const server = fakeClient((s) => (s.ids.includes("I1") ? RLS : null));
    const mem = memoryStorage();
    saveQueue(USER, [createItem("I1"), updateItem("I9")], mem);

    const result = await flushOutbox(USER, server.client, mem);

    expect(result.ok).toBe(false);
    expect(server.sent).toHaveLength(1);
    expect(loadQueue(USER, mem)[0]).toMatchObject({
      attempts: 1,
      lastCode: "42501",
    });
  });
});

describe("outbox-hulpjes voor geparkeerde operaties (#10)", () => {
  it("readyEntries laat afhankelijke operaties achter een geblokkeerde sleutel weg (transitief)", () => {
    const blocked = new Set(["item:I1"]);
    const reorder = entry({
      type: "item.reorder",
      listId: "L1",
      itemIds: ["I2", "I1"],
    });
    const nextReorder = entry({
      type: "item.reorder",
      listId: "L1",
      itemIds: ["I2"],
    });
    const ready = readyEntries(
      [updateItem("I1"), createItem("I2"), reorder, nextReorder],
      blocked,
    );
    // De tweede reorder van L1 wacht achter de eerste (zelfde volgorde-sleutel).
    expect(ready.map(idOf)).toEqual(["I2"]);
    expect(blocked).toEqual(new Set(["item:I1"])); // invoer ongewijzigd
  });

  it("nextBatch zet een geparkeerde operatie nooit in een bundel", () => {
    const p = { ...parked(createItem("I1")), lastError: CONNECTION_DROPPED };
    expect(nextBatch([p, createItem("I2")])).toEqual([p]);
    expect(nextBatch([createItem("I2"), p])).toHaveLength(1);
  });

  it("nextRetryAttempt telt geparkeerde operaties niet mee voor de backoff", () => {
    const failed = { ...createItem("I2"), attempts: 1, lastError: "x" };
    const p = { ...parked(createItem("I1")), attempts: 12 };
    expect(nextRetryAttempt([p, failed])).toBe(2);
  });

  it("een opgeslagen wachtrij van vóór #10 (zonder parkedAt/lastCode) laadt gewoon", () => {
    const old = [
      {
        opId: "op-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        attempts: 2,
        lastError: "x",
        type: "item.create",
        item: item("I1"),
      },
    ];
    expect(isOutboxEntryArray(old)).toBe(true);
    expect(isParked(old[0] as OutboxEntry)).toBe(false);
    expect(isOutboxEntryArray([{ ...old[0], parkedAt: 5 }])).toBe(false);
  });
});
