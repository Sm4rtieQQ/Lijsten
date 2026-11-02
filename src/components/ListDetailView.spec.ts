import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";

import ListDetailView from "./ListDetailView.vue";
import { handleBack } from "../composables/useBackNavigation";
import { useLists } from "../composables/useLists";
import { createList, createListItem, type ListItem } from "../types/app";

const { lists, activeListId, setActiveList } = useLists();

/** Zet één lijst met de gegeven items klaar en opent die als actieve lijst. */
function seed(items: ListItem[]): void {
  const list = { ...createList("Boodschappen"), items };
  lists.value = [list];
  setActiveList(list.id);
}

function item(text: string, done: boolean): ListItem {
  return createListItem({ listId: "l1", text, done });
}

describe("ListDetailView (clear-knop, AGENTS.md §8.6)", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    lists.value = [];
    setActiveList(null);
  });

  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
    setActiveList(null);
  });

  it("heeft de clear-knop disabled als er niets afgevinkt is (lege lijst)", () => {
    seed([]);
    wrapper = mount(ListDetailView);
    const clear = wrapper.get(".clear-button");
    expect((clear.element as HTMLButtonElement).disabled).toBe(true);
    expect(clear.attributes("aria-pressed")).toBe("false");
  });

  it("heeft de clear-knop disabled als er items zijn maar geen afgevinkte", () => {
    seed([item("Melk", false), item("Brood", false)]);
    wrapper = mount(ListDetailView);
    expect(
      (wrapper.get(".clear-button").element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("activeert de clear-knop zodra er wél iets afgevinkt is", () => {
    seed([item("Melk", true), item("Brood", false)]);
    wrapper = mount(ListDetailView);
    const clear = wrapper.get(".clear-button");
    expect((clear.element as HTMLButtonElement).disabled).toBe(false);
    expect(clear.text()).toContain("(1)");
  });

  it("wapent de clear-knop bij de eerste klik (twee-staps, §8.6)", async () => {
    seed([item("Melk", true)]);
    wrapper = mount(ListDetailView);
    const clear = wrapper.get(".clear-button");

    await clear.trigger("click");

    expect(clear.classes()).toContain("is-armed");
    expect(clear.attributes("aria-pressed")).toBe("true");
    expect(clear.attributes("aria-label")).toBe(
      "Bevestigen: afgevinkte items verwijderen",
    );
  });
});

describe("ListDetailView — Android-terugknop (AGENTS.md §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
    setActiveList(null);
  });

  it("annuleert eerst het bewerken, gaat daarna naar het overzicht", async () => {
    seed([item("Melk", false)]);
    wrapper = mount(ListDetailView);
    await wrapper.get(".edit-button").trigger("click");
    expect(wrapper.find("input.item-text").exists()).toBe(true);

    expect(handleBack()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("input.item-text").exists()).toBe(false);
    expect(activeListId.value).not.toBeNull();

    expect(handleBack()).toBe(true);
    expect(activeListId.value).toBeNull();

    // Op het overzicht handelt de detailweergave niets meer af.
    expect(handleBack()).toBe(false);
  });
});

describe("ListDetailView — item bewerken", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
    setActiveList(null);
  });

  it("zet de focus in het invoerveld zodra je gaat bewerken", async () => {
    seed([item("Melk", false)]);
    wrapper = mount(ListDetailView, { attachTo: document.body });
    await wrapper.get(".edit-button").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get("input.item-text").element);
  });
});
