import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMarkDirty } = vi.hoisted(() => ({ mockMarkDirty: vi.fn() }));

// Geen server: `refreshData` stopt dan meteen, zodat alleen de lokale cache en
// de outbox getest worden.
vi.mock("../lib/supabase", () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));
vi.mock("./useSync", () => ({
  markDirty: mockMarkDirty,
  registerPuller: vi.fn(),
  syncWithServer: vi.fn(() => Promise.resolve()),
}));

import {
  loadActiveView,
  loadLists,
  loadQueue,
  saveActiveView,
  saveLists,
} from "../lib/storage";
import { createList, createListItem } from "../types/app";
import { useLists } from "./useLists";

const USER = "user-a";
const L = useLists();

/** Outbox van USER als lijst van operatietypes. */
function opTypes(): string[] {
  return loadQueue(USER).map((entry) => entry.type);
}

beforeEach(async () => {
  localStorage.clear();
  L.reset();
  mockMarkDirty.mockClear();
  await L.hydrate(USER);
});

describe("useLists — mutaties via cache + outbox (AGENTS.md §7)", () => {
  it("createNewList: bovenaan, in de cache en als list.create in de outbox", () => {
    const first = L.createNewList("Eerste");
    const second = L.createNewList("  ");
    expect(L.lists.value.map((l) => l.id)).toEqual([second, first]);
    expect(L.lists.value[0]?.title).toBe("Nieuw lijstje");
    expect(loadLists(USER)?.length).toBe(2);
    expect(opTypes()).toEqual(["list.create", "list.create"]);
    expect(mockMarkDirty).toHaveBeenCalled();
  });

  it("renameList: trimt en negeert een lege titel", () => {
    const id = L.createNewList("Oud");
    L.renameList(id, "  Nieuw  ");
    L.renameList(id, "   ");
    expect(L.lists.value[0]?.title).toBe("Nieuw");
    expect(opTypes()).toEqual(["list.create", "list.update"]);
  });

  it("addItem: nieuwste bovenaan, één lager dan de bovenste; geen herschikking (§7.3)", () => {
    const id = L.createNewList("Boodschappen");
    L.addItem(id, "melk");
    L.addItem(id, " brood ");
    L.addItem(id, "   ");
    const items = L.lists.value[0]?.items ?? [];
    expect(items.map((i) => [i.text, i.position])).toEqual([
      ["brood", -1],
      ["melk", 0],
    ]);
    expect(opTypes()).toEqual(["list.create", "item.create", "item.create"]);
  });

  it("toggleItem / renameItem: item.update met de nieuwe staat", () => {
    const id = L.createNewList("x");
    L.addItem(id, "melk");
    const itemId = L.lists.value[0]!.items[0]!.id;
    L.toggleItem(itemId);
    L.renameItem(itemId, "havermelk");
    L.renameItem(itemId, "  ");
    expect(L.lists.value[0]?.items[0]).toMatchObject({
      text: "havermelk",
      done: true,
    });
    const updates = loadQueue(USER).filter((e) => e.type === "item.update");
    expect(updates).toHaveLength(2);
  });

  it("deleteItem en clearCompleted: item.delete per verwijderd item", () => {
    const id = L.createNewList("x");
    L.addItem(id, "a");
    L.addItem(id, "b");
    L.addItem(id, "c");
    const [c, b] = L.lists.value[0]!.items;
    L.deleteItem(c!.id);
    L.toggleItem(b!.id);
    L.clearCompleted(id);
    expect(L.lists.value[0]?.items.map((i) => i.text)).toEqual(["a"]);
    expect(opTypes().filter((t) => t === "item.delete")).toHaveLength(2);
  });

  it("deleteList: schrapt eerdere operaties van die lijst uit de outbox", () => {
    const keep = L.createNewList("Blijft");
    const gone = L.createNewList("Weg");
    L.addItem(gone, "item");
    L.addItem(keep, "item");
    L.setActiveList(gone);
    L.deleteList(gone);

    expect(L.lists.value.map((l) => l.id)).toEqual([keep]);
    expect(L.activeListId.value).toBeNull();
    const queue = loadQueue(USER);
    expect(queue.map((e) => e.type)).toEqual([
      "list.create",
      "item.create",
      "list.delete",
    ]);
    expect(JSON.stringify(queue.slice(0, -1))).not.toContain(gone);
    expect(queue.at(-1)).toMatchObject({ type: "list.delete", listId: gone });
  });

  it("reorderItems / reorderLists: alleen bij een echte, volledige wijziging", () => {
    const a = L.createNewList("A");
    const b = L.createNewList("B");
    L.reorderLists([b, a]); // al de huidige volgorde
    L.reorderLists([a]); // onvolledig
    L.reorderLists([a, b]);
    expect(L.lists.value.map((l) => l.id)).toEqual([a, b]);

    L.addItem(a, "1");
    L.addItem(a, "2");
    const ids = L.lists.value[0]!.items.map((i) => i.id);
    L.reorderItems(a, [...ids].reverse());
    expect(L.lists.value[0]?.items.map((i) => [i.text, i.position])).toEqual([
      ["1", 0],
      ["2", 1],
    ]);
    expect(opTypes().filter((t) => t.endsWith("reorder"))).toEqual([
      "list.reorder",
      "item.reorder",
    ]);
  });
});

describe("useLists — per-user isolatie (AGENTS.md §7.1)", () => {
  it("hydrate leest alleen de cache van die gebruiker; reset wist de keys", async () => {
    saveLists("user-b", [
      {
        ...createList("Van B"),
        items: [createListItem({ listId: "x", text: "geheim" })],
      },
    ]);
    L.createNewList("Van A");

    L.reset();
    expect(L.lists.value).toEqual([]);
    expect(loadLists(USER)).toBeNull();
    expect(loadQueue(USER)).toEqual([]);

    await L.hydrate("user-b");
    expect(L.lists.value.map((l) => l.title)).toEqual(["Van B"]);
  });

  it("zonder gebonden gebruiker gebeurt er niets", () => {
    L.reset();
    L.createNewList("Niemand");
    expect(L.lists.value).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
});

describe("useLists — laatst bezochte pagina (AGENTS.md §8.13)", () => {
  it("hydrate opent de laatst bezochte lijst weer", async () => {
    const id = L.createNewList("Boodschappen");
    L.setActiveList(id);
    expect(loadActiveView(USER)).toBe(id);

    await L.hydrate(USER); // bv. app opnieuw geopend
    expect(L.activeListId.value).toBe(id);
  });

  it("terug naar het overzicht wordt ook onthouden", async () => {
    const id = L.createNewList("Boodschappen");
    L.setActiveList(id);
    L.setActiveList(null);
    await L.hydrate(USER);
    expect(L.activeListId.value).toBeNull();
  });

  it("valt terug op het overzicht als de lijst niet meer bestaat", async () => {
    const id = L.createNewList("Weg");
    L.setActiveList(id);
    L.deleteList(id);
    expect(L.activeListId.value).toBeNull();
    expect(loadActiveView(USER)).toBeNull();

    saveActiveView(USER, "bestaat-niet");
    await L.hydrate(USER);
    expect(L.activeListId.value).toBeNull();
  });

  it("reset wist de onthouden pagina (per-user, §7.1)", () => {
    const id = L.createNewList("x");
    L.setActiveList(id);
    L.reset();
    expect(loadActiveView(USER)).toBeNull();
  });
});
