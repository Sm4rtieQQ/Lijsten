import type { List } from "../types/app";
import { isList } from "../types/app";
import { isOutboxEntryArray, type OutboxEntry } from "../types/sync";

/**
 * Per-gebruiker opslag in een `Storage`-achtige backend (default: localStorage).
 *
 * De backend is injecteerbaar zodat de logica in Node/tests verifieerbaar is.
 * Keys zijn ALTIJD per `userId` gescopeed (`lijstjes:data:<userId>`, enz.) —
 * een globale key bestaat bewust niet (fix voor het cross-user datalek, zie
 * AGENTS.md §11).
 */

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const browserStorage: StorageBackend = {
  getItem: (key) =>
    typeof localStorage !== "undefined" ? localStorage.getItem(key) : null,
  setItem: (key, value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

const dataKey = (userId: string): string => `lijstjes:data:${userId}`;
const queueKey = (userId: string): string => `lijstjes:queue:${userId}`;
const syncMetaKey = (userId: string): string => `lijstjes:sync:${userId}`;

export interface SyncMeta {
  /** ISO-tijdstip van de laatste succesvolle sync, of null als nog nooit. */
  lastSyncedAt: string | null;
  /** Laatste foutmelding van een (poging tot) sync. */
  lastError: string | null;
}

function parseJson<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Leest de lijsten-cache van één gebruiker. `null` = nog nooit opgeslagen. */
export function loadLists(
  userId: string,
  backend: StorageBackend = browserStorage,
): List[] | null {
  const parsed = parseJson<unknown>(backend.getItem(dataKey(userId)));
  if (parsed === null) return null;
  if (!Array.isArray(parsed)) return null;
  return parsed.every(isList) ? (parsed as List[]) : null;
}

export function saveLists(
  userId: string,
  lists: List[],
  backend: StorageBackend = browserStorage,
): void {
  backend.setItem(dataKey(userId), JSON.stringify(lists));
}

/** Leest de outbox van één gebruiker. `[]` = leeg. */
export function loadQueue(
  userId: string,
  backend: StorageBackend = browserStorage,
): OutboxEntry[] {
  const parsed = parseJson<unknown>(backend.getItem(queueKey(userId)));
  return isOutboxEntryArray(parsed) ? parsed : [];
}

export function saveQueue(
  userId: string,
  queue: OutboxEntry[],
  backend: StorageBackend = browserStorage,
): void {
  backend.setItem(queueKey(userId), JSON.stringify(queue));
}

export function loadSyncMeta(
  userId: string,
  backend: StorageBackend = browserStorage,
): SyncMeta {
  const parsed = parseJson<unknown>(backend.getItem(syncMetaKey(userId)));
  if (parsed !== null && typeof parsed === "object") {
    const m = parsed as Partial<SyncMeta>;
    if (typeof m.lastSyncedAt === "string" || m.lastSyncedAt === null) {
      return {
        lastSyncedAt: m.lastSyncedAt,
        lastError: typeof m.lastError === "string" ? m.lastError : null,
      };
    }
  }
  return { lastSyncedAt: null, lastError: null };
}

export function saveSyncMeta(
  userId: string,
  meta: SyncMeta,
  backend: StorageBackend = browserStorage,
): void {
  backend.setItem(syncMetaKey(userId), JSON.stringify(meta));
}

/** Wist alle per-user keys (data + outbox + sync-meta). Wordt aangeroepen bij uitloggen. */
export function clearUserData(
  userId: string,
  backend: StorageBackend = browserStorage,
): void {
  backend.removeItem(dataKey(userId));
  backend.removeItem(queueKey(userId));
  backend.removeItem(syncMetaKey(userId));
}

export { dataKey, queueKey, syncMetaKey };
