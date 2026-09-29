/**
 * Domeinmodellen zoals de app die gebruikt.
 *
 * Gescheiden van de Supabase-rijtypes (zie `src/lib/database.types.ts`).
 * `ListItem` draagt zijn `listId` zelf, zodat de outbox per item werkt
 * zonder de hele lijst mee te sturen.
 */

import { createId } from "../lib/utils";

export interface List {
  id: string;
  title: string;
  createdAt: string;
  items: ListItem[];
}

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  position: number;
  createdAt: string;
}

export function isListItem(value: unknown): value is ListItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.listId === "string" &&
    typeof v.text === "string" &&
    typeof v.done === "boolean" &&
    typeof v.position === "number" &&
    typeof v.createdAt === "string"
  );
}

export function isList(value: unknown): value is List {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.createdAt === "string" &&
    Array.isArray(v.items) &&
    v.items.every(isListItem)
  );
}

export function createListItem(
  partial: Pick<ListItem, "listId" | "text"> &
    Partial<Pick<ListItem, "done" | "position" | "createdAt">>,
): ListItem {
  return {
    id: createId(),
    listId: partial.listId,
    text: partial.text,
    done: partial.done ?? false,
    position: partial.position ?? 0,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

export function createList(title: string): List {
  return {
    id: createId(),
    title,
    createdAt: new Date().toISOString(),
    items: [],
  };
}
