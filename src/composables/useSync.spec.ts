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
  loadQueue: mockLoadQueue,
  browserStorage: {},
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
}));

import { bindSyncUser, markDirty, useSync } from "./useSync";

const { status, lastError } = useSync();

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
