import { ref, type Ref } from "vue";

import { createId } from "../lib/utils";
import {
  loadLists,
  saveLists,
  loadQueue,
  saveQueue,
  clearUserData,
  browserStorage,
} from "../lib/storage";
import { flushOutbox, pullListsFromServer } from "../lib/sync";
import { supabase } from "../lib/supabase";
import {
  hasFailed,
  type OutboxEntry,
  type OutboxOpPayload,
} from "../types/sync";
import {
  createList,
  createListItem,
  type List,
  type ListItem,
} from "../types/app";
import { markDirty } from "./useSync";

/**
 * Lijst-data + alle mutaties via de outbox (singleton-state).
 *
 * Regels (AGENTS.md §7 en §11):
 * - Server wordt alleen geschreven via per-entiteit outbox-operaties.
 * - Cache en outbox zijn per `userId` gescopeed (`lib/storage.ts`).
 * - Bij wisselen van gebruiker wordt state volledig gereset; er wordt nooit
 *   data van de vorige gebruiker gelezen of getoond.
 * - De array-volgorde van items/lijsten is de weergave-volgorde; na een
 *   volgorde-wijziging wordt een `item.reorder`/`list.reorder`-operatie
 *   geënqueued zodat de `position` op de server blijft kloppen.
 */
const lists: Ref<List[]> = ref([]);
const activeListId: Ref<string | null> = ref(null);
const hydrateToken: Ref<number> = ref(0);
let boundUser: string | null = null;

function requireUser(): string | null {
  return boundUser;
}

function enqueue(op: OutboxOpPayload): void {
  const user = requireUser();
  if (!user) return;
  const entry: OutboxEntry = {
    ...op,
    opId: createId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const queue = loadQueue(user, browserStorage);
  queue.push(entry);
  saveQueue(user, queue, browserStorage);
  markDirty();
}

function persistLists(): void {
  const user = requireUser();
  if (user) saveLists(user, lists.value, browserStorage);
}

/** Offline-first hydrate: cache laden → eigen outbox leegmaken → server pullen. */
async function hydrate(userId: string): Promise<void> {
  boundUser = userId;
  const token = ++hydrateToken.value;

  const cached = loadLists(userId, browserStorage);
  lists.value = cached ?? [];
  activeListId.value = null;

  await refreshData();
  if (token === hydrateToken.value) markDirty();
}

/**
 * Handmatige/automatische verversing: eerst de eigen outbox leegmaken,
 * daarna — alleen als de outbox nu leeg is — de server binnenhalen.
 * Een niet-lege outbox betekent dat de lokale cache nog ongeverifieerde
 * wijzigingen heeft; dan blijft de lokale state leidend.
 */
async function refreshData(): Promise<void> {
  const user = boundUser;
  if (!user || !supabase) return;
  const token = hydrateToken.value;

  await flushOutbox(user, supabase, browserStorage);
  if (token !== hydrateToken.value) return; // gebruiker is gewisseld ondertussen

  const after = loadQueue(user, browserStorage);
  if (after.length > 0) {
    markDirty();
    return;
  }
  const { data, error } = await pullListsFromServer(user, supabase);
  if (token !== hydrateToken.value) return;
  if (data && !error) {
    lists.value = data;
    saveLists(user, data, browserStorage);
  }
  markDirty();
}

/** Wist alle state + per-user keys (uitloggen of gebruiker wisselen). */
function reset(): void {
  if (boundUser) clearUserData(boundUser, browserStorage);
  boundUser = null;
  hydrateToken.value += 1;
  lists.value = [];
  activeListId.value = null;
}

function currentList(): List | undefined {
  return lists.value.find((list) => list.id === activeListId.value);
}

// --- Mutaties (enqueueen in de outbox + lokale cache bijwerken) ---

function createNewList(title: string): string {
  const user = requireUser();
  const list = createList(title.trim() || "Nieuw lijstje");
  if (user) {
    lists.value = [list, ...lists.value];
    persistLists();
    enqueue({ type: "list.create", listId: list.id, title: list.title });
  }
  return list.id;
}

function renameList(listId: string, title: string): void {
  const user = requireUser();
  const clean = title.trim();
  if (!user || !clean) return;
  lists.value = lists.value.map((list) =>
    list.id === listId ? { ...list, title: clean } : list,
  );
  persistLists();
  enqueue({ type: "list.update", listId, title: clean });
}

function deleteList(listId: string): void {
  const user = requireUser();
  if (!user) return;
  // Prune outbox: operaties van deze lijst vervallen (anders FK-fouten of nét
  // herschapen items na verwijderen van de lijst).
  const queue = loadQueue(user, browserStorage).filter((entry) => {
    switch (entry.type) {
      case "item.create":
      case "item.update":
        return entry.item.listId !== listId;
      case "item.delete":
      case "item.reorder":
        return entry.listId !== listId;
      case "list.reorder":
        return !entry.listIds.includes(listId);
      default:
        return entry.listId !== listId;
    }
  });
  saveQueue(user, queue, browserStorage);
  enqueue({ type: "list.delete", listId });

  lists.value = lists.value.filter((list) => list.id !== listId);
  persistLists();
  if (activeListId.value === listId) activeListId.value = null;
}

function addItem(listId: string, text: string): void {
  const user = requireUser();
  const clean = text.trim();
  if (!user || !clean) return;
  const list = lists.value.find((l) => l.id === listId);
  if (!list) return;

  const item: ListItem = createListItem({ listId, text: clean });
  // Nieuwste bovenaan (zoals de oude app); posities opnieuw laten
  // doorlopen zodat array-volgorde == position-volgorde blijft kloppen.
  const items = [item, ...list.items].map((it, index) => ({
    ...it,
    position: index,
  }));

  lists.value = lists.value.map((l) => (l.id === listId ? { ...l, items } : l));
  persistLists();
  enqueue({ type: "item.create", item: { ...item, position: 0 } });
  enqueue({
    type: "item.reorder",
    listId,
    itemIds: items.map((i) => i.id),
  });
}

function updateItem(
  itemId: string,
  updater: (item: ListItem) => ListItem,
): void {
  const user = requireUser();
  if (!user) return;
  let updated: ListItem | undefined;
  lists.value = lists.value.map((list) => {
    const found = list.items.find((i) => i.id === itemId);
    if (!found) return list;
    updated = updater(found);
    return {
      ...list,
      items: list.items.map((i) => (i.id === itemId ? updated! : i)),
    };
  });
  if (!updated) return;
  persistLists();
  enqueue({ type: "item.update", item: updated });
}

function toggleItem(itemId: string): void {
  updateItem(itemId, (item) => ({ ...item, done: !item.done }));
}

function renameItem(itemId: string, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  updateItem(itemId, (item) => ({ ...item, text: clean }));
}

function deleteItem(itemId: string): void {
  const user = requireUser();
  if (!user) return;
  const owner = lists.value.find((list) =>
    list.items.some((i) => i.id === itemId),
  );
  if (!owner) return;
  lists.value = lists.value.map((list) =>
    list.id === owner.id
      ? { ...list, items: list.items.filter((i) => i.id !== itemId) }
      : list,
  );
  persistLists();
  enqueue({ type: "item.delete", itemId, listId: owner.id });
}

function clearCompleted(listId: string): void {
  const user = requireUser();
  const list = lists.value.find((l) => l.id === listId);
  if (!user || !list) return;
  const done = list.items.filter((i) => i.done);
  done.forEach((item) =>
    enqueue({ type: "item.delete", itemId: item.id, listId }),
  );
  lists.value = lists.value.map((l) =>
    l.id === listId ? { ...l, items: l.items.filter((i) => !i.done) } : l,
  );
  persistLists();
}

/** Past de item-volgorde aan (drag & drop) en enqueued een reorder-operatie. */
function reorderItems(listId: string, itemIds: string[]): void {
  const user = requireUser();
  if (!user) return;
  const list = lists.value.find((l) => l.id === listId);
  if (!list) return;

  const byId = new Map(list.items.map((i) => [i.id, i]));
  const reordered = itemIds
    .map((id) => byId.get(id))
    .filter((i): i is ListItem => i !== undefined);
  if (reordered.length !== list.items.length) return;
  if (reordered.every((i, index) => i.id === list.items[index]?.id)) return;

  const items = reordered.map((it, index) => ({ ...it, position: index }));
  lists.value = lists.value.map((l) => (l.id === listId ? { ...l, items } : l));
  persistLists();
  enqueue({ type: "item.reorder", listId, itemIds });
}

/** Past de lijst-volgorde aan (drag & drop) en enqueued een reorder-operatie. */
function reorderLists(listIds: string[]): void {
  const user = requireUser();
  if (!user) return;

  const byId = new Map(lists.value.map((l) => [l.id, l]));
  const reordered = listIds
    .map((id) => byId.get(id))
    .filter((l): l is List => l !== undefined);
  if (reordered.length !== lists.value.length) return;
  if (reordered.every((l, index) => l.id === lists.value[index]?.id)) return;

  lists.value = reordered;
  persistLists();
  enqueue({ type: "list.reorder", listIds });
}

function setActiveList(listId: string | null): void {
  activeListId.value = listId;
}

/** Aantal openstaande (niet gefaalde) outbox-operaties — voor de UI. */
function pendingOps(): number {
  const user = requireUser();
  if (!user) return 0;
  return loadQueue(user, browserStorage).filter((e) => !hasFailed(e)).length;
}

export function useLists() {
  return {
    lists,
    activeListId,
    currentList,
    hydrate,
    refreshData,
    reset,
    createNewList,
    renameList,
    deleteList,
    addItem,
    toggleItem,
    renameItem,
    deleteItem,
    clearCompleted,
    reorderItems,
    reorderLists,
    setActiveList,
    pendingOps,
  };
}
