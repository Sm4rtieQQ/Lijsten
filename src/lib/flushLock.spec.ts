import { describe, expect, it, vi } from "vitest";

import {
  LEASE_POLL_MS,
  LEASE_TTL_MS,
  flushLockName,
  withFlushLock,
  type FlushLockDeps,
} from "./flushLock";
import {
  flushLeaseKey,
  loadFlushLease,
  saveFlushLease,
  type StorageBackend,
} from "./storage";

const USER = "user-1";

function memoryStorage(): StorageBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Lease-deps met een eigen klok: `sleep` zet de klok vooruit. */
function leaseDeps(
  backend: StorageBackend,
  owner = "tab-a",
): FlushLockDeps & { clock: { now: number } } {
  const clock = { now: 1_000_000 };
  return {
    clock,
    locks: null,
    backend,
    owner,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
}

describe("withFlushLock — lease-terugval (geen Web Locks)", () => {
  it("neemt een verlopen lease van een gesloten tabblad meteen over", async () => {
    const backend = memoryStorage();
    const deps = leaseDeps(backend);
    saveFlushLease(USER, { owner: "dead-tab", expiresAt: 0 }, backend);
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withFlushLock(USER, fn, deps)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(loadFlushLease(USER, backend)).toBeNull(); // vrijgegeven
  });

  it("wacht op een geldige lease van een ander tabblad tot die verloopt", async () => {
    const backend = memoryStorage();
    const deps = leaseDeps(backend);
    const start = deps.clock.now;
    saveFlushLease(
      USER,
      { owner: "tab-b", expiresAt: start + LEASE_TTL_MS },
      backend,
    );
    let ranAt = 0;

    await withFlushLock(
      USER,
      async () => {
        ranAt = deps.clock.now;
        // Tijdens het versturen staat de lease op naam van dit tabblad.
        expect(loadFlushLease(USER, backend)?.owner).toBe("tab-a");
      },
      deps,
    );

    expect(ranAt).toBeGreaterThanOrEqual(start + LEASE_TTL_MS);
    expect(ranAt).toBeLessThan(start + LEASE_TTL_MS + 2 * LEASE_POLL_MS + 100);
  });

  it("laat de lease van een ander tabblad staan bij het vrijgeven", async () => {
    const backend = memoryStorage();
    const deps = leaseDeps(backend);

    await withFlushLock(
      USER,
      async () => {
        // Bv. na een lange pauze nam een ander de verlopen lease over.
        saveFlushLease(USER, { owner: "tab-b", expiresAt: 9e15 }, backend);
      },
      deps,
    );

    expect(loadFlushLease(USER, backend)?.owner).toBe("tab-b");
  });

  it("werkt zonder slot als de opslag niets bewaart (geen localStorage)", async () => {
    const backend: StorageBackend = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const fn = vi.fn().mockResolvedValue(true);

    await expect(withFlushLock(USER, fn, leaseDeps(backend))).resolves.toBe(
      true,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("werkt zonder slot als schrijven faalt (quota/privémodus)", async () => {
    const backend = memoryStorage();
    backend.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const fn = vi.fn().mockResolvedValue(true);

    await expect(withFlushLock(USER, fn, leaseDeps(backend))).resolves.toBe(
      true,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("geeft de lease ook vrij als de flush faalt", async () => {
    const backend = memoryStorage();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withFlushLock(USER, fn, leaseDeps(backend))).rejects.toThrow(
      "boom",
    );
    expect(backend.data.has(flushLeaseKey(USER))).toBe(false);
  });
});

describe("withFlushLock — Web Locks", () => {
  it("vraagt het slot per gebruiker aan en gebruikt dan geen lease", async () => {
    const backend = memoryStorage();
    const request = vi.fn(
      (_name: string, cb: (lock: unknown) => Promise<unknown>) => cb({}),
    );
    const deps = { ...leaseDeps(backend), locks: { request } as never };

    await expect(withFlushLock(USER, async () => "ok", deps)).resolves.toBe(
      "ok",
    );
    expect(request).toHaveBeenCalledWith(
      flushLockName(USER),
      expect.any(Function),
    );
    expect(backend.data.size).toBe(0);
  });

  it("geeft een fout uit de flush door zonder hem nog eens te draaien", async () => {
    const backend = memoryStorage();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = {
      ...leaseDeps(backend),
      locks: {
        request: (_name: string, cb: (lock: unknown) => Promise<unknown>) =>
          cb({}),
      } as never,
    };

    await expect(withFlushLock(USER, fn, deps)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
