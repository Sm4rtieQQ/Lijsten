import { ref, type Ref } from "vue";

import { createOutboxEntry, pruneQueueForList } from "../lib/outbox";
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
import type { OutboxOpPayload } from "../types/sync";
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
/** De gebruiker van wie de state nu geladen is; `null` = niemand (geen mutaties). */
let boundUser: string | null = null;

function enqueue(op: OutboxOpPayload): void {
  const user = boundUser;
  if (!user) return;
  const queue = loadQueue(user, browserStorage);
  queue.push(createOutboxEntry(op));
  saveQueue(user, queue, browserStorage);
  markDirty();
}

function persistLists(): void {
  if (boundUser) saveLists(boundUser, lists.value, browserStorage);
}

/** Vervangt de items van één lijst (immutable, voor reactiviteit). */
function setItems(listId: string, items: ListItem[]): void {
  lists.value = lists.value.map((l) => (l.id === listId ? { ...l, items } : l));
}

function findList(listId: string): List | undefined {
  return lists.value.find((l) => l.id === listId);
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
  return activeListId.value ? findList(activeListId.value) : undefined;
}

/** De lijst waarin item `itemId` staat. */
function findOwner(itemId: string): List | undefined {
  return lists.value.find((l) => l.items.some((i) => i.id === itemId));
}

// --- Mutaties (enqueueen in de outbox + lokale cache bijwerken) ---

function createNewList(title: string): string {
  const list = createList(title.trim() || "Nieuw lijstje");
  if (boundUser) {
    lists.value = [list, ...lists.value];
    persistLists();
    enqueue({ type: "list.create", listId: list.id, title: list.title });
  }
  return list.id;
}

function renameList(listId: string, title: string): void {
  const clean = title.trim();
  if (!boundUser || !clean) return;
  lists.value = lists.value.map((list) =>
    list.id === listId ? { ...list, title: clean } : list,
  );
  persistLists();
  enqueue({ type: "list.update", listId, title: clean });
}

function deleteList(listId: string): void {
  const user = boundUser;
  if (!user) return;
  saveQueue(
    user,
    pruneQueueForList(loadQueue(user, browserStorage), listId),
    browserStorage,
  );
  enqueue({ type: "list.delete", listId });

  lists.value = lists.value.filter((list) => list.id !== listId);
  persistLists();
  if (activeListId.value === listId) activeListId.value = null;
}

function addItem(listId: string, text: string): void {
  const clean = text.trim();
  const list = findList(listId);
  if (!boundUser || !clean || !list) return;

  const item: ListItem = createListItem({ listId, text: clean });
  // Nieuwste bovenaan (zoals de oude app); posities opnieuw laten
  // doorlopen zodat array-volgorde == position-volgorde blijft kloppen.
  const items = [item, ...list.items].map((it, index) => ({
    ...it,
    position: index,
  }));

  setItems(listId, items);
  persistLists();
  enqueue({ type: "item.create", item: { ...item, position: 0 } });
  enqueue({ type: "item.reorder", listId, itemIds: items.map((i) => i.id) });
}

function updateItem(
  itemId: string,
  updater: (item: ListItem) => ListItem,
): void {
  const owner = findOwner(itemId);
  const found = owner?.items.find((i) => i.id === itemId);
  if (!boundUser || !owner || !found) return;
  const updated = updater(found);
  setItems(
    owner.id,
    owner.items.map((i) => (i.id === itemId ? updated : i)),
  );
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
  const owner = findOwner(itemId);
  if (!boundUser || !owner) return;
  setItems(
    owner.id,
    owner.items.filter((i) => i.id !== itemId),
  );
  persistLists();
  enqueue({ type: "item.delete", itemId, listId: owner.id });
}

function clearCompleted(listId: string): void {
  const list = findList(listId);
  if (!boundUser || !list) return;
  for (const item of list.items) {
    if (item.done) enqueue({ type: "item.delete", itemId: item.id, listId });
  }
  setItems(
    listId,
    list.items.filter((i) => !i.done),
  );
  persistLists();
}

/**
 * Zet `ids` om naar de entiteiten in die volgorde — alleen als het een
 * volledige permutatie is die ook echt iets verandert; anders `null`.
 */
function reorderedBy<T extends { id: string }>(
  current: readonly T[],
  ids: readonly string[],
): T[] | null {
  const byId = new Map(current.map((entity) => [entity.id, entity]));
  const next = ids
    .map((id) => byId.get(id))
    .filter((entity): entity is T => entity !== undefined);
  if (next.length !== current.length) return null;
  if (next.every((entity, index) => entity.id === current[index]?.id)) {
    return null;
  }
  return next;
}

/** Past de item-volgorde aan (drag & drop) en enqueued een reorder-operatie. */
function reorderItems(listId: string, itemIds: string[]): void {
  const list = findList(listId);
  if (!boundUser || !list) return;
  const reordered = reorderedBy(list.items, itemIds);
  if (!reordered) return;

  setItems(
    listId,
    reordered.map((it, index) => ({ ...it, position: index })),
  );
  persistLists();
  enqueue({ type: "item.reorder", listId, itemIds });
}

/** Past de lijst-volgorde aan (drag & drop) en enqueued een reorder-operatie. */
function reorderLists(listIds: string[]): void {
  if (!boundUser) return;
  const reordered = reorderedBy(lists.value, listIds);
  if (!reordered) return;

  lists.value = reordered;
  persistLists();
  enqueue({ type: "list.reorder", listIds });
}

function setActiveList(listId: string | null): void {
  activeListId.value = listId;
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
  };
}
