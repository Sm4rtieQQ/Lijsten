import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OutboxEntry } from "../types/sync";

/**
 * Geparkeerde operaties in de scheduler (#10): de pill blijft rood, de
 * automatische flush laat ze liggen (geen backoff-lus), een volledige sync en
 * het uitloggen proberen ze opnieuw, en de pull blijft uit zolang ze er zijn.
 */

const { mockFlushOutbox, mockLoadQueue } = vi.hoisted(() => ({
  mockFlushOutbox: vi.fn(),
  mockLoadQueue: vi.fn(),
}));

vi.mock("../lib/sync", () => ({
  flushOutbox: mockFlushOutbox,
  backoffMs: () => 0,
}));

vi.mock("../lib/storage", () => ({
  loadSyncMeta: () => ({ lastSyncedAt: null, lastError: null }),
  saveSyncMeta: vi.fn(),
  loadQueue: mockLoadQueue,
  browserStorage: {},
  queueKey: (userId: string) => `lijstjes:queue:${userId}`,
  syncMetaKey: (userId: string) => `lijstjes:sync:${userId}`,
}));

vi.mock("../lib/flushLock", () => ({
  withFlushLock: (_userId: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
}));

import {
  bindSyncUser,
  flushBeforeSignOut,
  flushNow,
  registerPuller,
  syncWithServer,
  useSync,
} from "./useSync";

const { status } = useSync();

const parkedEntry: OutboxEntry = {
  opId: "op-parked",
  createdAt: "2026-11-17T10:00:00.000Z",
  attempts: 3,
  lastError: "Geen toegang tot deze gegevens.",
  lastCode: "42501",
  parkedAt: "2026-11-17T10:00:05.000Z",
  type: "list.delete",
  listId: "L1",
};

/** Een run die alles verstuurde, maar waarbij de geparkeerde blijft staan. */
const parkedResult = {
  ok: true,
  error: null,
  syncedCount: 0,
  queuedCount: 1,
  parkedCount: 1,
  queue: [parkedEntry],
};

const optionsOf = (call: number): unknown =>
  mockFlushOutbox.mock.calls[call]?.[3];

describe("useSync — geparkeerde operaties (#10)", () => {
  const puller = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    mockFlushOutbox.mockReset();
    mockLoadQueue.mockReset();
    puller.mockReset();
    puller.mockResolvedValue(null);
    registerPuller(puller);
    mockLoadQueue.mockReturnValue([parkedEntry]);
    mockFlushOutbox.mockResolvedValue(parkedResult);
  });

  afterEach(() => {
    bindSyncUser(null);
    registerPuller(null);
    vi.useRealTimers();
  });

  it("de pill is rood zolang er een geparkeerde operatie is", () => {
    bindSyncUser("user-1");
    expect(status.value).toBe("error");
  });

  it("de automatische flush probeert geparkeerde operaties niet en plant geen retry", async () => {
    bindSyncUser("user-1");

    await flushNow();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockFlushOutbox).toHaveBeenCalledTimes(1);
    expect(optionsOf(0)).toEqual({ retryParked: false });
    expect(status.value).toBe("error");
  });

  it("een volledige sync (de pill 'Probeer opnieuw') probeert ze wel opnieuw", async () => {
    bindSyncUser("user-1");

    await syncWithServer();

    expect(optionsOf(0)).toEqual({ retryParked: true });
  });

  it("de pull blijft uit zolang er geparkeerde operaties zijn (lokale state blijft leidend)", async () => {
    bindSyncUser("user-1");

    await syncWithServer();

    expect(puller).not.toHaveBeenCalled();
    expect(status.value).toBe("error");
  });

  it("lukt de geparkeerde operatie bij de retry, dan volgt de pull en wordt de pill groen", async () => {
    bindSyncUser("user-1");
    mockFlushOutbox.mockImplementation(async () => {
      mockLoadQueue.mockReturnValue([]);
      return { ...parkedResult, queuedCount: 0, parkedCount: 0, queue: [] };
    });

    await syncWithServer();

    expect(puller).toHaveBeenCalledTimes(1);
    expect(status.value).toBe("synced");
  });

  it("een volledige sync tijdens een lopende automatische flush probeert daarna alsnog de geparkeerde", async () => {
    bindSyncUser("user-1");
    let release!: () => void;
    mockFlushOutbox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(parkedResult);
        }),
    );

    const auto = flushNow();
    const full = syncWithServer();
    release();
    await Promise.all([auto, full]);

    expect(mockFlushOutbox).toHaveBeenCalledTimes(2);
    expect(optionsOf(0)).toEqual({ retryParked: false });
    expect(optionsOf(1)).toEqual({ retryParked: true });
  });

  it("uitloggen probeert ze opnieuw en telt ze als niet-verstuurde wijzigingen", async () => {
    bindSyncUser("user-1");

    const safe = await flushBeforeSignOut();

    expect(optionsOf(0)).toEqual({ retryParked: true });
    expect(safe).toBe(false); // → 'Toch uitloggen' (§7.3)
  });
});
