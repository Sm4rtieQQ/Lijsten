import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LockManagerLike } from "../lib/flushLock";
import type { StorageBackend } from "../lib/storage";
import type { OutboxEntry } from "../types/sync";

/**
 * Twee tabbladen/instanties met één gedeelde outbox (AGENTS.md §7.3, issue #7).
 * Elke "instantie" is een eigen kopie van de modules (`vi.resetModules`), net
 * als twee tabbladen; localStorage en `navigator.locks` zijn gedeeld.
 */

const USER = "user-1";
const QUEUE_KEY = `lijstjes:queue:${USER}`;
const SYNC_KEY = `lijstjes:sync:${USER}`;

const { mockFlushOutbox, sent } = vi.hoisted(() => ({
  mockFlushOutbox: vi.fn(),
  sent: [] as string[],
}));

vi.mock("../lib/sync", () => ({
  flushOutbox: mockFlushOutbox,
  backoffMs: () => 60_000,
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
}));

/**
 * Nagebootste `flushOutbox`: leest de wachtrij, "verstuurt" alles (duurt even,
 * zoals een request) en haalt daarna de verstuurde operaties eruit.
 */
async function fakeFlush(userId: string, _client: unknown, backend: unknown) {
  const storage =
    await vi.importActual<typeof import("../lib/storage")>("../lib/storage");
  const store = backend as StorageBackend;
  const queue = storage.loadQueue(userId, store);
  sent.push(...queue.map((entry) => entry.opId));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const ids = new Set(queue.map((entry) => entry.opId));
  const next = storage
    .loadQueue(userId, store)
    .filter((entry) => !ids.has(entry.opId));
  storage.saveQueue(userId, next, store);
  return { ok: true, error: null, queue: next };
}

function entry(opId: string): OutboxEntry {
  return {
    opId,
    type: "item.delete",
    listId: "list-1",
    itemId: opId,
    createdAt: "2026-11-17T10:00:00.000Z",
    attempts: 0,
    lastError: null,
  } as OutboxEntry;
}

function seedQueue(ids: string[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ids.map(entry)));
}

/** Een eigen kopie van useSync (en dus van flushLock/storage): één tabblad. */
async function openTab() {
  vi.resetModules();
  const mod = await import("./useSync");
  mod.bindSyncUser(USER);
  return mod;
}

/** Minimale Web Locks: exclusief per naam, wachtenden in volgorde. */
function fakeLocks(): LockManagerLike {
  const tails = new Map<string, Promise<void>>();
  return {
    request<T>(name: string, callback: (lock: unknown) => Promise<T>) {
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      tails.set(
        name,
        previous.then(() => held),
      );
      return previous.then(async () => {
        try {
          return await callback({ name });
        } finally {
          release();
        }
      });
    },
  };
}

function setLocks(value: LockManagerLike | undefined): void {
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value,
  });
}

const tabs: Array<{ bindSyncUser(userId: string | null): void }> = [];

beforeEach(() => {
  localStorage.clear();
  sent.length = 0;
  mockFlushOutbox.mockReset();
  mockFlushOutbox.mockImplementation(fakeFlush);
});

afterEach(() => {
  for (const tab of tabs.splice(0)) tab.bindSyncUser(null);
  setLocks(undefined);
  localStorage.clear();
});

async function twoTabs() {
  const a = await openTab();
  const b = await openTab();
  tabs.push(a, b);
  return { a, b };
}

describe("useSync — één verzender over tabbladen heen (issue #7)", () => {
  it("met Web Locks: twee tabbladen versturen elke operatie één keer", async () => {
    setLocks(fakeLocks());
    seedQueue(["op-1", "op-2", "op-3"]);
    const { a, b } = await twoTabs();

    const [okA, okB] = await Promise.all([a.flushNow(), b.flushNow()]);

    expect(sent.sort()).toEqual(["op-1", "op-2", "op-3"]);
    expect(okA).toBe(true);
    expect(okB).toBe(true);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null")).toEqual([]);
  });

  it("zonder Web Locks (lease in localStorage): elke operatie één keer", async () => {
    setLocks(undefined);
    seedQueue(["op-1", "op-2", "op-3"]);
    const { a, b } = await twoTabs();

    const [okA, okB] = await Promise.all([a.flushNow(), b.flushNow()]);

    expect(sent.sort()).toEqual(["op-1", "op-2", "op-3"]);
    expect(okA).toBe(true);
    expect(okB).toBe(true);
    // De lease is na afloop vrijgegeven.
    expect(localStorage.getItem(`lijstjes:flush-lease:${USER}`)).toBeNull();
  });

  it("weigert Web Locks, dan valt de app terug op de lease (geen crash)", async () => {
    setLocks({
      request: () =>
        Promise.reject(new DOMException("denied", "SecurityError")),
    });
    seedQueue(["op-1", "op-2"]);
    const { a, b } = await twoTabs();

    const [okA, okB] = await Promise.all([a.flushNow(), b.flushNow()]);

    expect(sent.sort()).toEqual(["op-1", "op-2"]);
    expect(okA && okB).toBe(true);
  });

  it("de pill in het tweede tabblad volgt een flush in het eerste (storage-event)", async () => {
    seedQueue(["op-1"]);
    const { a, b } = await twoTabs();
    const syncB = b.useSync();
    expect(syncB.status.value).toBe("pending");
    expect(syncB.queueLength.value).toBe(1);

    await a.flushNow();
    // De browser stuurt `storage` alleen naar de andere tabbladen; hier zelf.
    window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: SYNC_KEY }));

    expect(syncB.status.value).toBe("synced");
    expect(syncB.queueLength.value).toBe(0);
    expect(syncB.lastSyncedAt.value).toBe(a.useSync().lastSyncedAt.value);
    expect(syncB.lastSyncedAt.value).not.toBeNull();
  });

  it("een wijziging in een ander tabblad zet de pill hier op In wachtrij", async () => {
    const { b } = await twoTabs();
    const syncB = b.useSync();
    expect(syncB.status.value).toBe("synced");

    seedQueue(["op-9"]);
    window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));

    expect(syncB.status.value).toBe("pending");
    expect(syncB.queueLength.value).toBe(1);
    // Het andere tabblad verstuurt zijn eigen wijziging; hier niet.
    expect(mockFlushOutbox).not.toHaveBeenCalled();
  });

  it("negeert storage-events van andere keys en zonder gebruiker", async () => {
    const { b } = await twoTabs();
    const syncB = b.useSync();
    seedQueue(["op-1"]);

    window.dispatchEvent(
      new StorageEvent("storage", { key: `lijstjes:queue:other-user` }),
    );
    expect(syncB.status.value).toBe("synced");

    b.bindSyncUser(null);
    window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));
    expect(syncB.status.value).toBe("synced");
  });
});
