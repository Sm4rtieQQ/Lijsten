import type { OutboxEntry, OutboxOpPayload } from "../types/sync";
import { createId } from "./utils";

/** Maakt van een operatie een outbox-entry (nieuw `opId`, nog niet geprobeerd). */
export function createOutboxEntry(
  op: OutboxOpPayload,
  now: Date = new Date(),
): OutboxEntry {
  const entry: OutboxEntry = {
    ...op,
    opId: createId(),
    createdAt: now.toISOString(),
    attempts: 0,
    lastError: null,
  };
  return entry;
}

/** Hoort deze operatie bij lijst `listId` (de lijst zelf of een van haar items)? */
export function touchesList(entry: OutboxEntry, listId: string): boolean {
  switch (entry.type) {
    case "item.create":
    case "item.update":
      return entry.item.listId === listId;
    case "list.reorder":
      return entry.listIds.includes(listId);
    default:
      return entry.listId === listId;
  }
}

/**
 * Outbox zonder de operaties van een te verwijderen lijst. Anders volgen er na
 * `list.delete` nog FK-fouten, of worden er nét verwijderde items herschapen.
 */
export function pruneQueueForList(
  queue: readonly OutboxEntry[],
  listId: string,
): OutboxEntry[] {
  return queue.filter((entry) => !touchesList(entry, listId));
}

/** Volgende poging voor de backoff: één hoger dan de hoogste `attempts`. */
export function nextRetryAttempt(queue: readonly OutboxEntry[]): number {
  return Math.max(0, ...queue.map((entry) => entry.attempts)) + 1;
}
