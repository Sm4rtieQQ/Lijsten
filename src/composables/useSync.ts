import { ref, type Ref } from "vue";

import { flushOutbox, backoffMs, pullListsFromServer } from "../lib/sync";
import { toUserFacingError, NETWORK_ERROR } from "../lib/errorMessages";
import { loadSyncMeta, loadQueue, browserStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { hasFailed, type OutboxEntry } from "../types/sync";
import type { List } from "../types/app";

export type SyncStatus = "synced" | "pending" | "syncing" | "error";

/**
 * Sync-status + scheduler (singleton-state).
 *
 * Statussen (zie AGENTS.md §7.4):
 * - `synced`:   outbox leeg, geen fouten — alles gesynchroniseerd.
 * - `pending`:  outbox heeft openstaande (niet gefaalde) operaties.
 * - `syncing`:  een flush draait op dit moment.
 * - `error`:    minstens één operatie is gefaald (wordt met backoff herhaald).
 *
 * De lijst-data zelf leeft in `useLists`; deze module regelt alleen het
 * synchroniseren en de status-afleiding.
 */
const status: Ref<SyncStatus> = ref("synced");
const lastSyncedAt: Ref<string | null> = ref(null);
const lastError: Ref<string | null> = ref(null);
const queueLength: Ref<number> = ref(0);
/** Eerste paar gefaalde outbox-operaties (voor leesbare UI-foutmeldingen). */
const failedOps: Ref<OutboxEntry[]> = ref([]);

let boundUser: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
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

/** Bindt de huidige gebruiker; bij wisselen wordt alle sync-state gereset. */
export function bindSyncUser(userId: string | null): void {
  boundUser = userId;
  // Leg 'offline' ook bij koud starten vast (het offline-event was dan al voorbij).
  offlineMode = typeof navigator !== "undefined" && navigator.onLine === false;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  status.value = "synced";
  lastError.value = null;
  failedOps.value = [];
  if (userId) {
    const meta = loadSyncMeta(userId, browserStorage);
    lastSyncedAt.value = meta.lastSyncedAt;
    queueLength.value = loadQueue(userId, browserStorage).length;
    refreshStatus();
  } else {
    lastSyncedAt.value = null;
    queueLength.value = 0;
    failedOps.value = [];
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
  failedOps.value = queue.filter(hasFailed).slice(0, 3);
  if (queue.some(hasFailed)) {
    status.value = "error";
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

function scheduleFlush(delay = 700): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runFlush();
  }, delay);
}

async function runFlush(): Promise<void> {
  if (!boundUser || !supabase || flushing) return;
  // Offline bekend (DevTools-'Offline', vliegtuigmodus, écht geen netwerk):
  // niet eens proberen te flushen — meteen 'error'. Een hangende request kan
  // hierdoor nooit meer de spinner blokkeren (D6-fix); het 'online'-event
  // start daarna automatisch opnieuw.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    offlineMode = true;
    status.value = "error";
    lastError.value = NETWORK_ERROR;
    return;
  }
  const userId = boundUser;
  flushing = true;
  status.value = "syncing";

  // `flushOutbox` mag nooit rejecten, maar dit is het vangnet (D3): mocht er
  // tóch een onverwerkte fout doorheen komen, dan krijgen we een leesbare
  // NL-fout + error-status, en `flushing` komt in `finally` altijd vrij — de
  // status blijft nooit hangen op `syncing`.
  try {
    const result = await flushOutbox(userId, supabase, browserStorage);

    queueLength.value = result.queue.length;
    lastError.value = result.error;
    if (result.ok) {
      lastSyncedAt.value = new Date().toISOString();
    }
    // refreshStatus() leidt de status af uit de outbox; de fout zit erin
    // gemarkeerd, dus bij niet-ok wordt dit "error".
    refreshStatus();

    if (!result.ok) {
      // retry met backoff op basis van de hoogste attempt-teller
      const maxAttempts = Math.max(
        0,
        ...result.queue.map((entry) => entry.attempts),
      );
      scheduleRetry(maxAttempts + 1);
    }
  } catch (err) {
    // Onverwerkte fout (vangnet): status op error, leesbare tekst, retry.
    lastError.value = toUserFacingError(err);
    status.value = "error";
    const queue = boundUser ? loadQueue(boundUser, browserStorage) : [];
    const maxAttempts = Math.max(0, ...queue.map((entry) => entry.attempts));
    scheduleRetry(maxAttempts + 1);
  } finally {
    flushing = false;
  }
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void runFlush(), backoffMs(attempts));
}

/** Handmatig "Synchroniseer nu" (ook voor retry van gefaalde operaties). */
async function syncNow(): Promise<void> {
  if (!boundUser) return;
  await runFlush();
}

/** Haalt de lijsten van de server op en geeft ze terug (zonder cache te overschrijven). */
async function fetchFromServer(): Promise<List[] | null> {
  if (!boundUser || !supabase) return null;
  const { data, error } = await pullListsFromServer(boundUser, supabase);
  return error ? null : data;
}

export function useSync() {
  return {
    status,
    lastSyncedAt,
    lastError,
    queueLength,
    failedOps,
    syncNow,
    fetchFromServer,
    markDirty,
  };
}
