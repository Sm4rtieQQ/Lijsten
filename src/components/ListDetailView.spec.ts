import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";

import ListDetailView from "./ListDetailView.vue";
import { handleBack } from "../composables/useBackNavigation";
import { useLists } from "../composables/useLists";
import { createList, createListItem, type ListItem } from "../types/app";

const { lists, activeListId, setActiveList } = useLists();
const CLEAR = '[data-testid="clear-completed"]';
const EDIT_INPUT = 'input[aria-label^="Pas item aan"]';

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
    const clear = wrapper.get(CLEAR);
    expect((clear.element as HTMLButtonElement).disabled).toBe(true);
    expect(clear.attributes("aria-pressed")).toBe("false");
  });

  it("heeft de clear-knop disabled als er items zijn maar geen afgevinkte", () => {
    seed([item("Melk", false), item("Brood", false)]);
    wrapper = mount(ListDetailView);
    expect((wrapper.get(CLEAR).element as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("activeert de clear-knop zodra er wél iets afgevinkt is", () => {
    seed([item("Melk", true), item("Brood", false)]);
    wrapper = mount(ListDetailView);
    const clear = wrapper.get(CLEAR);
    expect((clear.element as HTMLButtonElement).disabled).toBe(false);
    expect(clear.text()).toContain("(1)");
  });

  it("wapent de clear-knop bij de eerste klik (twee-staps, §8.6)", async () => {
    seed([item("Melk", true)]);
    wrapper = mount(ListDetailView);
    const clear = wrapper.get(CLEAR);

    await clear.trigger("click");

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
    await wrapper.get('button[aria-label="Item aanpassen"]').trigger("click");
    expect(wrapper.find(EDIT_INPUT).exists()).toBe(true);

    expect(handleBack()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(EDIT_INPUT).exists()).toBe(false);
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
    await wrapper.get('button[aria-label="Item aanpassen"]').trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get(EDIT_INPUT).element);
  });
});

describe("ListDetailView — titel", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
    setActiveList(null);
  });

  const TITLE = 'input[aria-label="Naam van het lijstje"]';

  /** Typt in het veld zoals een gebruiker: waarde zetten + `input`. */
  async function type(text: string): Promise<HTMLInputElement> {
    const input = wrapper!.get(TITLE);
    const el = input.element as HTMLInputElement;
    el.value = text;
    await input.trigger("input");
    return el;
  }

  it("toont de titel en volgt een nieuwe naam van de lijst", async () => {
    seed([]);
    wrapper = mount(ListDetailView);
    const el = wrapper.get(TITLE).element as HTMLInputElement;
    expect(el.value).toBe("Boodschappen");

    lists.value = lists.value.map((list) => ({ ...list, title: "Markt" }));
    await flushPromises();
    expect(el.value).toBe("Markt");
  });

  it("zet een lege titel bij change terug naar de huidige naam", async () => {
    seed([]);
    wrapper = mount(ListDetailView);
    const el = await type("   ");
    await wrapper.get(TITLE).trigger("change");
    expect(el.value).toBe("Boodschappen");
    expect(lists.value[0]?.title).toBe("Boodschappen");
  });

  it("begrenst nieuwe titels op 24 tekens en krimpt de letter tijdens het typen (#47)", async () => {
    seed([]);
    wrapper = mount(ListDetailView);
    const input = wrapper.get(TITLE);
    expect(input.attributes("maxlength")).toBe("24");
    expect(input.attributes("data-title-size")).toBe("lg");

    await type("a".repeat(17));
    expect(input.attributes("data-title-size")).toBe("md");
    await type("Boodschappen weekend AH");
    expect(input.attributes("data-title-size")).toBe("sm");
  });

  it("laat een oude titel van 60 tekens heel bij focus en blur (#47)", async () => {
    const legacy = "x".repeat(60);
    seed([]);
    lists.value = lists.value.map((list) => ({ ...list, title: legacy }));
    wrapper = mount(ListDetailView);
    await flushPromises();
    const input = wrapper.get(TITLE);
    expect((input.element as HTMLInputElement).value).toBe(legacy);
    expect(input.attributes("data-title-size")).toBe("sm");

    await input.trigger("focus");
    await input.trigger("blur");
    expect((input.element as HTMLInputElement).value).toBe(legacy);
    expect(lists.value[0]?.title).toBe(legacy);
  });
});

describe("ListDetailView — plek van de sync-pill (AGENTS.md §7.4)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
    setActiveList(null);
  });

  it("zet de pill in de rij van de terugknop, niet naast de titel", () => {
    seed([]);
    wrapper = mount(ListDetailView);
    const titleRow = wrapper.get('[data-testid="title-row"]');
    const backRow = wrapper.get('[data-testid="back-row"]');

    expect(titleRow.find('[data-testid="sync-dot"]').exists()).toBe(false);
    expect(
      titleRow.find('input[aria-label="Naam van het lijstje"]').exists(),
    ).toBe(true);
    expect(backRow.find('[data-testid="sync-dot"]').exists()).toBe(true);
    expect(backRow.text()).toContain("Alle lijstjes");
  });
});
