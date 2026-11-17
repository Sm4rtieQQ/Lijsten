import { ref, type Ref } from "vue";

import { nextRetryAttempt } from "../lib/outbox";
import { flushOutbox, backoffMs } from "../lib/sync";
import { withFlushLock } from "../lib/flushLock";
import { toUserFacingError, NETWORK_ERROR } from "../lib/errorMessages";
import {
  loadSyncMeta,
  saveSyncMeta,
  loadQueue,
  browserStorage,
  queueKey,
  syncMetaKey,
} from "../lib/storage";
import { supabase } from "../lib/supabase";
import { hasFailed } from "../types/sync";

export type SyncStatus = "synced" | "pending" | "syncing" | "error";

/**
 * Haalt de server binnen in de lokale state. Geeft een leesbare NL-fout terug,
 * of `null` bij succes (of als er niets te halen viel). Wordt door `useLists`
 * geregistreerd; zo kent deze module de lijst-data niet (geen circulaire import).
 */
export type Puller = () => Promise<string | null>;

/**
 * Sync-status + scheduler (singleton-state).
 *
 * Statussen (zie AGENTS.md §7.4):
 * - `synced`:   outbox leeg, geen fouten — alles gesynchroniseerd.
 * - `pending`:  outbox heeft openstaande (niet gefaalde) operaties.
 * - `syncing`:  een flush of pull draait op dit moment.
 * - `error`:    een operatie of de pull is mislukt (de outbox wordt met
 *               backoff herhaald; de pull bij de volgende sync), of er staan
 *               geparkeerde operaties in de outbox (#10).
 *
 * Er zijn twee soorten synchroniseren:
 * - `runFlush`: alleen de outbox pushen. Automatisch na elke mutatie en bij
 *   retry/backoff of het `online`-event.
 * - `syncWithServer`: pushen **en** daarna de server binnenhalen. Voor alles
 *   wat de gebruiker als "synchroniseren" ziet: de pill, terugkeren naar de
 *   app, het opstarten en de swipe omlaag.
 */
const status: Ref<SyncStatus> = ref("synced");
const lastSyncedAt: Ref<string | null> = ref(null);
const lastError: Ref<string | null> = ref(null);
const queueLength: Ref<number> = ref(0);

/** Zo lang na de laatste wijziging wordt de outbox verstuurd (§7.3). */
export const FLUSH_DEBOUNCE_MS = 30_000;
/** Uiterlijk zo lang na de eerste nog niet verstuurde wijziging (§7.3). */
export const MAX_FLUSH_WAIT_MS = 120_000;
/** De automatische pull bij terugkeren hooguit één keer per… (§7.4). */
export const AUTO_PULL_MIN_INTERVAL_MS = 30_000;

let boundUser: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
/** Tijdstip van de eerste wijziging die nog op verzending wacht. */
let firstPendingAt: number | null = null;
/** Start van de laatste volledige sync (voor de pull-begrenzing). */
let lastFullSyncStartedAt: number | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let pulling = false;
/** Fout van de laatste pull; houdt de pill rood tot de volgende sync. */
let pullError: string | null = null;
let flushInFlight: Promise<boolean> | null = null;
/** Probeert de lopende flush ook de geparkeerde operaties opnieuw (#10)? */
let flushInFlightRetriesParked = false;
let syncInFlight: Promise<void> | null = null;
let puller: Puller | null = null;
/** Navigatie is als offline bekend (`navigator.onLine === false`): status forceren
 *  op error en niet eens proberen te flushen (fast-path voor de D6-fix). */
let offlineMode = false;
let connectivityRegistered = false;

/**
 * Eénmalig (module-singleton) online/offline-luisteraars.
 * - `offline`: de groene pill mag niet 'synced' blijven claimen als het netwerk
 *   wegvalt — direct naar `error`.
 * - `online`: direct opnieuw flushen zodat de wachtrij zo snel mogelijk leegloopt
 *   (zonder te wachten op de volgende mutatie of tabblad-wissel).
 */
function registerConnectivityListeners(): void {
  if (typeof window === "undefined" || connectivityRegistered) return;
  connectivityRegistered = true;
  window.addEventListener("offline", () => {
    offlineMode = true;
    status.value = "error";
    lastError.value = NETWORK_ERROR;
  });
  window.addEventListener("online", () => {
    offlineMode = false;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (boundUser) void runFlush();
  });
}
registerConnectivityListeners();

let storageListenerRegistered = false;

/**
 * Andere tabbladen/instanties delen de outbox (§7.3). Het `storage`-event komt
 * alleen in de *andere* tabbladen binnen: verstuurt of wijzigt tabblad A de
 * wachtrij, dan volgen de wachtrijlengte en de pill in tabblad B meteen.
 */
function registerStorageListener(): void {
  if (typeof window === "undefined" || storageListenerRegistered) return;
  storageListenerRegistered = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    const userId = boundUser;
    if (!userId) return;
    // `key === null`: localStorage.clear() in een ander tabblad.
    if (event.key === null || event.key === queueKey(userId)) {
      refreshStatus();
    }
    if (event.key === null || event.key === syncMetaKey(userId)) {
      const meta = loadSyncMeta(userId, browserStorage);
      if (meta.lastSyncedAt) lastSyncedAt.value = meta.lastSyncedAt;
    }
  });
}
registerStorageListener();

/** Registreert de pull van `useLists` (eenmalig, bij het laden van die module). */
export function registerPuller(fn: Puller | null): void {
  puller = fn;
}

/** Bindt de huidige gebruiker; bij wisselen wordt alle sync-state gereset. */
export function bindSyncUser(userId: string | null): void {
  boundUser = userId;
  // Leg 'offline' ook bij koud starten vast (het offline-event was dan al voorbij).
  offlineMode = typeof navigator !== "undefined" && navigator.onLine === false;
  cancelScheduledFlush();
  lastFullSyncStartedAt = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  status.value = "synced";
  lastError.value = null;
  pullError = null;
  if (userId) {
    const meta = loadSyncMeta(userId, browserStorage);
    lastSyncedAt.value = meta.lastSyncedAt;
    queueLength.value = loadQueue(userId, browserStorage).length;
    refreshStatus();
  } else {
    lastSyncedAt.value = null;
    queueLength.value = 0;
  }
}

function refreshStatus(): void {
  // Offline (fast-path): de status is 'error' en mag niet terugvallen naar
  // 'pending'/'synced' op basis van de (nog onverzonden) outbox.
  if (offlineMode) {
    status.value = "error";
    return;
  }
  const queue = boundUser ? loadQueue(boundUser, browserStorage) : [];
  queueLength.value = queue.length;
  if (queue.some(hasFailed) || pullError) {
    status.value = "error";
    return;
  }
  if (pulling) {
    status.value = "syncing";
    return;
  }
  if (queue.length > 0) {
    status.value = flushing ? "syncing" : "pending";
    return;
  }
  status.value = "synced";
}

/** Wordt door `useLists` aangeroepen na elke mutatie (outbox groeide). */
export function markDirty(): void {
  refreshStatus();
  scheduleFlush();
}

/**
 * Versturen 30 s na de laatste wijziging (§7.3): elke wijziging start de timer
 * opnieuw, zodat een reeks wijzigingen samen vertrekt. Bij doorlopend bewerken
 * wordt er uiterlijk 2 min na de eerste nog niet verstuurde wijziging gestuurd.
 */
function scheduleFlush(): void {
  const now = Date.now();
  if (firstPendingAt === null) firstPendingAt = now;
  const untilMaxWait = firstPendingAt + MAX_FLUSH_WAIT_MS - now;
  const delay = Math.max(0, Math.min(FLUSH_DEBOUNCE_MS, untilMaxWait));
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runFlush();
  }, delay);
}

/** Een geplande verzending vervalt (er wordt nu meteen verstuurd). */
function cancelScheduledFlush(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  firstPendingAt = null;
}

/**
 * Nu meteen versturen, zonder de wachttijd af te wachten (app naar de
 * achtergrond, `online`). Alleen pushen, geen pull.
 */
export function flushNow(): Promise<boolean> {
  return runFlush();
}

/**
 * Vóór het uitloggen alles versturen: uitloggen wist de outbox (§7.1). `true`
 * = er staat niets meer in de wachtrij en uitloggen is veilig; `false` = er
 * blijven wijzigingen achter (offline of fout) — de UI vraagt dan bevestiging.
 */
export async function flushBeforeSignOut(): Promise<boolean> {
  const userId = boundUser;
  if (!userId) return true;
  if (loadQueue(userId, browserStorage).length === 0) return true;
  // Laatste kans: ook de geparkeerde operaties nog één keer (#10). Blijven ze
  // geparkeerd, dan tellen ze als niet-verstuurde wijzigingen.
  await runFlush(true);
  return loadQueue(userId, browserStorage).length === 0;
}

/**
 * De automatische pull bij terugkeren naar de app/het tabblad: hooguit één
 * keer per 30 s (gerekend vanaf de vorige volledige sync, ook een handmatige).
 * De pill en de swipe gebruiken `syncWithServer` en zijn niet begrensd.
 */
export function syncWithServerIfStale(): Promise<void> {
  if (
    lastFullSyncStartedAt !== null &&
    Date.now() - lastFullSyncStartedAt < AUTO_PULL_MIN_INTERVAL_MS
  ) {
    return Promise.resolve();
  }
  return syncWithServer();
}

/**
 * Pusht de outbox. Loopt er al een flush, dan wacht de aanroeper op díe flush
 * (geen tweede tegelijk). `true` = de outbox is nu leeg en er is verbinding.
 *
 * Over tabbladen heen verstuurt er ook maar één tegelijk (`withFlushLock`):
 * een tweede tabblad wacht op het slot en leest de wachtrij daarna opnieuw
 * (`flushOutbox` laadt hem zelf), dus een al verstuurde operatie gaat niet
 * nog eens.
 *
 * `retryParked` (#10): ook de geparkeerde operaties opnieuw proberen. Loopt
 * er al een flush zonder, dan volgt er daarna nog één mét.
 */
function runFlush(retryParked = false): Promise<boolean> {
  if (flushInFlight) {
    if (!retryParked || flushInFlightRetriesParked) return flushInFlight;
    return flushInFlight.then(() => runFlush(true));
  }
  flushInFlightRetriesParked = retryParked;
  flushInFlight = lockedFlush(retryParked).finally(() => {
    flushInFlight = null;
    flushInFlightRetriesParked = false;
  });
  return flushInFlight;
}

function lockedFlush(retryParked: boolean): Promise<boolean> {
  const userId = boundUser;
  if (!userId || !supabase) return Promise.resolve(false);
  return withFlushLock(userId, () =>
    // Gebruiker gewisseld terwijl we op het slot wachtten: niets versturen.
    boundUser === userId ? doFlush(retryParked) : Promise.resolve(false),
  );
}

async function doFlush(retryParked: boolean): Promise<boolean> {
  if (!boundUser || !supabase) return false;
  // Deze flush neemt alles mee wat nu in de outbox staat; een geplande
  // verzending is dan overbodig. Wijzigingen tijdens de flush plannen opnieuw.
  cancelScheduledFlush();
  // Offline bekend (DevTools-'Offline', vliegtuigmodus, écht geen netwerk):
  // niet eens proberen te flushen — meteen 'error'. Een hangende request kan
  // hierdoor nooit meer de spinner blokkeren (D6-fix); het 'online'-event
  // start daarna automatisch opnieuw.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    offlineMode = true;
    status.value = "error";
    lastError.value = NETWORK_ERROR;
    return false;
  }
  const userId = boundUser;
  flushing = true;
  status.value = "syncing";

  // `flushOutbox` mag nooit rejecten, maar dit is het vangnet (D3): mocht er
  // tóch een onverwerkte fout doorheen komen, dan krijgen we een leesbare
  // NL-fout + error-status, en `flushing` komt in `finally` altijd vrij — de
  // status blijft nooit hangen op `syncing`.
  try {
    const result = await flushOutbox(userId, supabase, browserStorage, {
      retryParked,
    });

    queueLength.value = result.queue.length;
    lastError.value = result.error ?? pullError;
    // Geparkeerde operaties over (#10): geen schone sync, het tijdstip en de
    // fout in de sync-meta (gezet door `flushOutbox`) blijven staan.
    if (result.ok && !result.parkedCount) {
      lastSyncedAt.value = new Date().toISOString();
      // Bewaren, zodat andere tabbladen het tijdstip via `storage` volgen.
      // Best effort: een volle of geblokkeerde opslag maakt een geslaagde
      // flush niet alsnog tot een fout (en start geen retry-lus).
      try {
        saveSyncMeta(
          userId,
          { lastSyncedAt: lastSyncedAt.value, lastError: null },
          browserStorage,
        );
      } catch {
        // Alleen het tijdstip in andere tabbladen loopt dan achter.
      }
    }
    // refreshStatus() leidt de status af uit de outbox; de fout zit erin
    // gemarkeerd, dus bij niet-ok wordt dit "error".
    refreshStatus();

    if (!result.ok) {
      // retry met backoff op basis van de hoogste attempt-teller. Alleen
      // geparkeerde operaties over (ok): geen retry-lus, die gaan pas bij de
      // volgende volledige sync opnieuw (#10).
      scheduleRetry(nextRetryAttempt(result.queue));
    }
    // Niet leeg (ook door geparkeerde operaties) → geen pull: de lokale state
    // blijft leidend (§7.4).
    return result.ok && result.queue.length === 0;
  } catch (err) {
    // Onverwerkte fout (vangnet): status op error, leesbare tekst, retry.
    lastError.value = toUserFacingError(err);
    status.value = "error";
    const queue = boundUser ? loadQueue(boundUser, browserStorage) : [];
    scheduleRetry(nextRetryAttempt(queue));
    return false;
  } finally {
    flushing = false;
  }
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void runFlush(), backoffMs(attempts));
}

/**
 * Volledige sync: outbox pushen en daarna de server binnenhalen (alleen als
 * de outbox leeg is — anders blijft de lokale state leidend). Eén tegelijk:
 * een tweede aanroep wacht op de lopende. De pill staat de hele tijd op
 * `syncing` en eindigt op `synced` of `error`. Reject nooit (§7.5).
 */
export function syncWithServer(): Promise<void> {
  if (!syncInFlight) {
    syncInFlight = doSync().finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}

async function doSync(): Promise<void> {
  const userId = boundUser;
  if (!userId || !supabase) return;
  lastFullSyncStartedAt = Date.now();
  pullError = null;

  // Een volledige sync probeert ook de geparkeerde operaties opnieuw (#10).
  const flushed = await runFlush(true);
  if (!flushed || !puller || boundUser !== userId) {
    refreshStatus();
    return;
  }

  pulling = true;
  status.value = "syncing";
  try {
    pullError = await puller();
  } catch (err) {
    pullError = toUserFacingError(err);
  } finally {
    pulling = false;
  }
  if (boundUser !== userId) return; // gebruiker gewisseld tijdens de pull

  lastError.value = pullError;
  if (!pullError) {
    lastSyncedAt.value = new Date().toISOString();
    saveSyncMeta(
      userId,
      { lastSyncedAt: lastSyncedAt.value, lastError: null },
      browserStorage,
    );
  }
  refreshStatus();
}

export function useSync() {
  return {
    status,
    lastSyncedAt,
    lastError,
    queueLength,
    /**
     * De pill: volledige sync (ook voor retry van gefaalde en geparkeerde
     * operaties, #10).
     */
    syncNow: syncWithServer,
    markDirty,
  };
}
