import type { ListItem } from "./app";

/**
 * Outbox-operaties (discriminated union).
 *
 * De server wordt UITSLUITEND geschreven vanuit deze outbox, in FIFO-volgorde.
 * Deze types zijn ook de basis voor de sync-status: een entry met
 * `attempts > 0` of `lastError` is gefaald en wordt met backoff opnieuw
 * geprobeerd. Een entry met `parkedAt` is geparkeerd (#10): de server weigerde
 * hem blijvend; hij blijft bewaard maar houdt de rest niet meer op. Zie
 * `src/lib/sync.ts`.
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
  /**
   * Postgres/PostgREST-foutcode van de laatste mislukte poging (bv. `23503`),
   * alleen voor diagnose; nooit tonen (§7.5). Ontbreekt in oudere wachtrijen.
   */
  lastCode?: string | null;
  /**
   * Zoveel keer op rij weigerde de server deze operatie blijvend (#10); een
   * tijdelijke fout zet hem terug op 0. Bij `PARK_AFTER_ATTEMPTS` wordt hij
   * geparkeerd. Ontbreekt in oudere wachtrijen (= 0).
   */
  rejections?: number;
  /**
   * ISO-tijdstip waarop de operatie geparkeerd werd (#10): de server weigerde
   * hem blijvend. Hij blijft bewaard, gaat niet meer automatisch opnieuw en
   * houdt de rest van de wachtrij niet op. Ontbreekt = niet geparkeerd.
   */
  parkedAt?: string;
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

/** Is deze operatie geparkeerd (blijvend geweigerd, #10)? */
export function isParked(entry: OutboxEntry): boolean {
  return typeof entry.parkedAt === "string";
}

export function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.opId === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.attempts === "number" &&
    (typeof v.lastError === "string" || v.lastError === null) &&
    (v.lastCode === undefined ||
      v.lastCode === null ||
      typeof v.lastCode === "string") &&
    (v.rejections === undefined || typeof v.rejections === "number") &&
    (v.parkedAt === undefined || typeof v.parkedAt === "string") &&
    typeof v.type === "string"
  );
}

export function isOutboxEntryArray(value: unknown): value is OutboxEntry[] {
  return Array.isArray(value) && value.every(isOutboxEntry);
}
