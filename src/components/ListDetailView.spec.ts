import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";

import ListDetailView from "./ListDetailView.vue";
import { useLists } from "../composables/useLists";
import { createList, createListItem, type ListItem } from "../types/app";

const { lists, setActiveList } = useLists();

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
