import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NETWORK_ERROR } from "../lib/errorMessages";

const { mockFlushOutbox, mockLoadQueue, mockLoadSyncMeta } = vi.hoisted(() => ({
  mockFlushOutbox: vi.fn(),
  mockLoadQueue: vi.fn(),
  mockLoadSyncMeta: vi.fn(),
}));

vi.mock("../lib/sync", () => ({
  flushOutbox: mockFlushOutbox,
  backoffMs: () => 0,
  pullListsFromServer: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock("../lib/storage", () => ({
  loadSyncMeta: mockLoadSyncMeta,
  saveSyncMeta: vi.fn(),
  loadQueue: mockLoadQueue,
  browserStorage: {},
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
}));

import {
  bindSyncUser,
  markDirty,
  registerPuller,
  syncWithServer,
  useSync,
} from "./useSync";

const { status, lastError, lastSyncedAt, syncNow } = useSync();

/** jsdom kent `navigator.onLine`; per test overschrijven op het instance-object. */
function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useSync — offline fast-path (D6, AGENTS.md §7.4)", () => {
  beforeEach(() => {
    setOnline(true);
    mockFlushOutbox.mockReset();
    mockLoadQueue.mockReset();
    mockLoadSyncMeta.mockReset();
    mockLoadQueue.mockReturnValue([]);
    mockLoadSyncMeta.mockReturnValue({ lastSyncedAt: null });
  });

  afterEach(() => {
    bindSyncUser(null);
    vi.useRealTimers();
  });

  it("bindt een gebruiker die offline start direct op error, zonder flushpoging", () => {
    setOnline(false);

    bindSyncUser("user-1");

    expect(status.value).toBe("error");
    // bindSyncUser zet bewust géén lastError: refreshStatus leidt alleen status
    // af; een echte flush/offline-event vult lastError wel in (D6).
    expect(mockFlushOutbox).not.toHaveBeenCalled();
  });

  it("zet bij het offline-event de pill onmiddellijk op error", () => {
    bindSyncUser("user-1");
    expect(status.value).toBe("synced"); // eerst normaal gesynchroniseerd

    window.dispatchEvent(new Event("offline"));

    expect(status.value).toBe("error");
    expect(lastError.value).toBe(NETWORK_ERROR);
  });

  it("flusht automatisch zodra de verbinding terug is (online-event)", async () => {
    mockFlushOutbox.mockResolvedValue({ ok: true, queue: [], error: null });
    bindSyncUser("user-1");
    window.dispatchEvent(new Event("offline"));
    expect(status.value).toBe("error");

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(mockFlushOutbox).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(status.value).toBe("synced"));
  });

  it("markDirty blijft error bij offline navigator en flusht niet (geen hangende spinner)", () => {
    vi.useFakeTimers();
    setOnline(false);
    bindSyncUser("user-1");
    expect(status.value).toBe("error");

    mockLoadQueue.mockReturnValue([{ opId: "op-1" }]);
    markDirty();

    // De 700ms-flush mag de offline short-circuit nooit voorbijgaan.
    vi.advanceTimersByTime(1000);
    expect(status.value).toBe("error");
    expect(mockFlushOutbox).not.toHaveBeenCalled();
  });

  it("markDirty online met lege wachtrij blijft synced (geen valse pending)", () => {
    bindSyncUser("user-1");
    markDirty();
    expect(status.value).toBe("synced");
  });
});

describe("useSync — volledige sync: pushen en dan binnenhalen (AGENTS.md §7.4)", () => {
  const puller = vi.fn<() => Promise<string | null>>();

  beforeEach(() => {
    setOnline(true);
    mockFlushOutbox.mockReset();
    mockLoadQueue.mockReset();
    mockLoadSyncMeta.mockReset();
    mockLoadQueue.mockReturnValue([]);
    mockLoadSyncMeta.mockReturnValue({ lastSyncedAt: null });
    mockFlushOutbox.mockResolvedValue({ ok: true, queue: [], error: null });
    puller.mockReset();
    puller.mockResolvedValue(null);
    registerPuller(puller);
    bindSyncUser("user-1");
  });

  afterEach(() => {
    registerPuller(null);
    bindSyncUser(null);
  });

  it("pusht eerst, haalt dan binnen; spinner tijdens de pull, daarna groen", async () => {
    let finishPull: (value: string | null) => void = () => {};
    puller.mockImplementation(
      () => new Promise((resolve) => (finishPull = resolve)),
    );

    const run = syncWithServer();
    await vi.waitFor(() => expect(puller).toHaveBeenCalledOnce());
    expect(mockFlushOutbox).toHaveBeenCalledOnce();
    expect(status.value).toBe("syncing");

    finishPull(null);
    await run;
    expect(status.value).toBe("synced");
    expect(lastSyncedAt.value).not.toBeNull();
  });

  it("haalt niet binnen als de outbox na het pushen niet leeg is", async () => {
    mockFlushOutbox.mockResolvedValue({
      ok: false,
      queue: [{ opId: "op-1", attempts: 1, lastError: "x" }],
      error: "Synchronisatie mislukt. Probeer het opnieuw.",
    });
    await syncWithServer();
    expect(puller).not.toHaveBeenCalled();
  });

  it("twee aanroepen tegelijk = één sync", async () => {
    await Promise.all([syncWithServer(), syncWithServer()]);
    expect(mockFlushOutbox).toHaveBeenCalledOnce();
    expect(puller).toHaveBeenCalledOnce();
  });

  it("een mislukte pull maakt de pill rood; de volgende sync herstelt", async () => {
    puller.mockResolvedValueOnce(NETWORK_ERROR);
    await syncWithServer();
    expect(status.value).toBe("error");
    expect(lastError.value).toBe(NETWORK_ERROR);

    await syncWithServer();
    expect(status.value).toBe("synced");
    expect(lastError.value).toBeNull();
  });

  it("een gooiende pull wordt afgevangen (reject nooit, §7.5)", async () => {
    puller.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(syncWithServer()).resolves.toBeUndefined();
    expect(status.value).toBe("error");
    expect(lastError.value).toBe(NETWORK_ERROR);
  });

  it("de pill (syncNow) doet de volledige sync", async () => {
    await syncNow();
    expect(mockFlushOutbox).toHaveBeenCalledOnce();
    expect(puller).toHaveBeenCalledOnce();
  });
});
