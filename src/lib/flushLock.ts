import {
  browserStorage,
  loadFlushLease,
  releaseFlushLease,
  saveFlushLease,
  type StorageBackend,
} from "./storage";

/**
 * Eén verzender per gebruiker over tabbladen en instanties heen (AGENTS.md
 * §7.3). Alle tabbladen (en de PWA naast een browsertab) delen dezelfde
 * outbox in localStorage; zonder slot versturen ze dezelfde operaties tegelijk
 * en kan de tragere de wachtrij met al verstuurde operaties terugschrijven.
 *
 * - **Web Locks** (`navigator.locks`) waar die bestaat: de browser geeft het
 *   slot vanzelf vrij als een tabblad sluit of crasht.
 * - **Terugval: een lease in localStorage** (`lijstjes:flush-lease:<userId>`)
 *   met een korte geldigheid die tijdens het versturen wordt verlengd. Een
 *   gesloten tabblad houdt de lease dus hooguit `LEASE_TTL_MS` vast.
 * - Is er geen bruikbare opslag (of weigert hij), dan werkt de app zoals
 *   voorheen: versturen zonder slot. Dubbel versturen is dan nog veilig
 *   omdat creates idempotent zijn (§7.3), het slot spaart alleen requests.
 *
 * Een tweede aanroeper wacht tot het slot vrij is en verstuurt daarna zelf
 * (de wachtrij wordt binnen het slot opnieuw gelezen, meestal is hij dan leeg).
 */

/** Zo lang geldt een lease zonder verlenging. */
export const LEASE_TTL_MS = 15_000;
/** Zo vaak verlengt de houder de lease tijdens het versturen. */
export const LEASE_RENEW_MS = 5_000;
/** Zo vaak kijkt een wachtende instantie of de lease vrij is. */
export const LEASE_POLL_MS = 250;
/** Wachttijd tussen schrijven en teruglezen: wie het laatst schreef, wint. */
export const LEASE_SETTLE_MS = 50;

/** Het deel van de Web Locks API (`LockManager`) dat we gebruiken. */
export interface LockManagerLike {
  request<T>(name: string, callback: (lock: unknown) => Promise<T>): Promise<T>;
}

export interface FlushLockDeps {
  /** `null` = geen Web Locks: de lease in `backend` wordt gebruikt. */
  locks: LockManagerLike | null;
  backend: StorageBackend;
  /** Identiteit van deze instantie (tabblad/app) in de lease. */
  owner: string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const flushLockName = (userId: string): string =>
  `lijstjes-flush-${userId}`;

/** Eén id per geladen module = per tabblad of app-instantie. */
const instanceOwner = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

function webLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return null;
  const locks = navigator.locks as LockManagerLike | undefined;
  return locks && typeof locks.request === "function" ? locks : null;
}

function defaultDeps(): FlushLockDeps {
  return {
    locks: webLocks(),
    backend: browserStorage,
    owner: instanceOwner,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/**
 * Voert `fn` uit terwijl deze instantie het verzendslot van `userId` heeft.
 * Wacht als een andere instantie het heeft. Rejectet alleen als `fn` rejectet.
 */
export async function withFlushLock<T>(
  userId: string,
  fn: () => Promise<T>,
  overrides: Partial<FlushLockDeps> = {},
): Promise<T> {
  const deps: FlushLockDeps = { ...defaultDeps(), ...overrides };
  if (deps.locks) {
    let started = false;
    try {
      return await deps.locks.request(flushLockName(userId), () => {
        started = true;
        return fn();
      });
    } catch (err) {
      if (started) throw err;
      // Web Locks weigert (bv. SecurityError in een afgeschermde context):
      // terugvallen op de lease.
    }
  }
  return withLease(userId, fn, deps);
}

async function withLease<T>(
  userId: string,
  fn: () => Promise<T>,
  deps: FlushLockDeps,
): Promise<T> {
  const { backend, owner, now } = deps;
  if (!(await acquireLease(userId, deps))) return fn();

  const renew = setInterval(() => {
    try {
      // Alleen verlengen zolang we hem nog hebben (na een lange pauze kan een
      // ander hem na het verlopen hebben overgenomen; dan niet terugpakken).
      if (loadFlushLease(userId, backend)?.owner !== owner) {
        clearInterval(renew);
        return;
      }
      saveFlushLease(
        userId,
        { owner, expiresAt: now() + LEASE_TTL_MS },
        backend,
      );
    } catch {
      clearInterval(renew);
    }
  }, LEASE_RENEW_MS);

  try {
    return await fn();
  } finally {
    clearInterval(renew);
    try {
      releaseFlushLease(userId, owner, backend);
    } catch {
      // Opslag onbruikbaar: de lease verloopt vanzelf.
    }
  }
}

/**
 * `true` = deze instantie heeft de lease. `false` = de opslag kan geen lease
 * bewaren (geen localStorage, quota, privémodus): dan zonder slot verder.
 */
async function acquireLease(
  userId: string,
  deps: FlushLockDeps,
): Promise<boolean> {
  const { backend, owner, now, sleep } = deps;
  for (;;) {
    try {
      const current = loadFlushLease(userId, backend);
      if (current && current.owner !== owner && current.expiresAt > now()) {
        await sleep(LEASE_POLL_MS);
        continue;
      }
      saveFlushLease(
        userId,
        { owner, expiresAt: now() + LEASE_TTL_MS },
        backend,
      );
      await sleep(LEASE_SETTLE_MS);
      const check = loadFlushLease(userId, backend);
      if (check === null) return false;
      if (check.owner === owner) return true;
      // Een andere instantie schreef na ons: die wint, wij wachten.
    } catch {
      return false;
    }
  }
}
