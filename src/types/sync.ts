import type { ListItem } from "./app";

/**
 * Outbox-operaties (discriminated union).
 *
 * De server wordt UITSLUITEND geschreven vanuit deze outbox, in FIFO-volgorde.
 * Deze types zijn ook de basis voor de sync-status: een entry met
 * `attempts > 0` of `lastError` is gefaald en wordt met backoff opnieuw
 * geprobeerd. Zie `src/lib/sync.ts`.
 */
export type OutboxEntry =
  | CreateListOp
  | UpdateListOp
  | DeleteListOp
  | CreateItemOp
  | UpdateItemOp
  | DeleteItemOp
  | ReorderListsOp
  | ReorderItemsOp;

interface OutboxEntryBase {
  /** Uniek id van de operatie (geen id van de entiteit zelf). */
  opId: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export interface CreateListOp extends OutboxEntryBase {
  type: "list.create";
  listId: string;
  title: string;
}

export interface UpdateListOp extends OutboxEntryBase {
  type: "list.update";
  listId: string;
  title: string;
}

export interface DeleteListOp extends OutboxEntryBase {
  type: "list.delete";
  listId: string;
}

export interface CreateItemOp extends OutboxEntryBase {
  type: "item.create";
  item: ListItem;
}

export interface UpdateItemOp extends OutboxEntryBase {
  type: "item.update";
  item: ListItem;
}

export interface DeleteItemOp extends OutboxEntryBase {
  type: "item.delete";
  itemId: string;
  listId: string;
}

export interface ReorderListsOp extends OutboxEntryBase {
  type: "list.reorder";
  listIds: string[];
}

export interface ReorderItemsOp extends OutboxEntryBase {
  type: "item.reorder";
  listId: string;
  itemIds: string[];
}

/**
 * Een outbox-operatie zonder de automatisch toegevoegde base-velden.
 * Gebruikt door code die een operatie aanmaakt (zie `useLists.enqueue`).
 */
export type OutboxOpPayload =
  | Omit<CreateListOp, keyof OutboxEntryBase>
  | Omit<UpdateListOp, keyof OutboxEntryBase>
  | Omit<DeleteListOp, keyof OutboxEntryBase>
  | Omit<CreateItemOp, keyof OutboxEntryBase>
  | Omit<UpdateItemOp, keyof OutboxEntryBase>
  | Omit<DeleteItemOp, keyof OutboxEntryBase>
  | Omit<ReorderListsOp, keyof OutboxEntryBase>
  | Omit<ReorderItemsOp, keyof OutboxEntryBase>;

/** Bepaalt of een entry gefaald is en dus in de UI als "fout" telt. */
export function hasFailed(entry: OutboxEntry): boolean {
  return entry.attempts > 0 || entry.lastError !== null;
}

export function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.opId === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.attempts === "number" &&
    (typeof v.lastError === "string" || v.lastError === null) &&
    typeof v.type === "string"
  );
}

export function isOutboxEntryArray(value: unknown): value is OutboxEntry[] {
  return Array.isArray(value) && value.every(isOutboxEntry);
}
