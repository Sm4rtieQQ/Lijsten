import { ref, type Ref } from "vue";

import { flushOutbox, backoffMs, pullListsFromServer } from "../lib/sync";
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

/** Bindt de huidige gebruiker; bij wisselen wordt alle sync-state gereset. */
export function bindSyncUser(userId: string | null): void {
  boundUser = userId;
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
  const userId = boundUser;
  flushing = true;
  status.value = "syncing";

  const result = await flushOutbox(userId, supabase, browserStorage);

  flushing = false;
  queueLength.value = result.queue.length;
  lastError.value = result.error;
  if (result.ok) {
    lastSyncedAt.value = new Date().toISOString();
  }
  refreshStatus();

  if (!result.ok) {
    // retry met backoff op basis van de hoogste attempt-teller
    const maxAttempts = Math.max(
      0,
      ...result.queue.map((entry) => entry.attempts),
    );
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void runFlush(), backoffMs(maxAttempts));
  }
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
