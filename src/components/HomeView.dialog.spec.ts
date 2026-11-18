import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import type { User } from "@supabase/supabase-js";

const { mockCreateNewList, mockDeleteList } = vi.hoisted(() => ({
  mockCreateNewList: vi.fn((_title: string) => ""),
  mockDeleteList: vi.fn((_id: string) => undefined),
}));

vi.mock("../composables/useLists", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../composables/useLists")>();
  return {
    ...mod,
    useLists: () => ({
      ...mod.useLists(),
      createNewList: mockCreateNewList,
      deleteList: mockDeleteList,
    }),
  };
});

import HomeView from "./HomeView.vue";
import { stubDialog } from "./ui/dialogStub";
import { useAuth } from "../composables/useAuth";
import { handleBack } from "../composables/useBackNavigation";
import { useLists } from "../composables/useLists";
import { createList } from "../types/app";

const AUTH = useAuth();
const { lists } = useLists();

describe("HomeView — dialogen (AGENTS.md §8.3, §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  let restore: () => void;

  beforeEach(() => {
    restore = stubDialog();
    AUTH.user.value = { email: "piet@voorbeeld.nl" } as unknown as User;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    restore();
    lists.value = [];
    AUTH.user.value = null;
  });

  async function openNewList(): Promise<VueWrapper> {
    wrapper = mount(HomeView, { attachTo: document.body });
    await wrapper
      .get('button[aria-label="Account en acties"]')
      .trigger("click");
    await wrapper.get('[data-testid="new-list"]').trigger("click");
    await nextTick();
    await nextTick();
    return wrapper;
  }

  it("nieuw lijstje: opent met de focus in het veld; de terugknop sluit hem", async () => {
    const w = await openNewList();
    const dialog = w.get("dialog");
    expect(dialog.attributes("open")).toBeDefined();
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      w.get('input[aria-label="Naam van het lijstje"]').element,
    );

    expect(handleBack()).toBe(true);
    await nextTick();
    expect(dialog.attributes("open")).toBeUndefined();
    expect(handleBack()).toBe(false);
  });

  it("nieuw lijstje: versturen maakt de lijst en sluit de dialoog", async () => {
    const w = await openNewList();
    await w
      .get('input[aria-label="Naam van het lijstje"]')
      .setValue("Vakantie");
    await w.get("dialog form").trigger("submit");
    expect(mockCreateNewList).toHaveBeenCalledWith("Vakantie");
    expect(w.get("dialog").attributes("open")).toBeUndefined();
  });

  async function openConfirm(): Promise<VueWrapper> {
    lists.value = [createList("Boodschappen")];
    wrapper = mount(HomeView, { attachTo: document.body });
    await wrapper
      .get('button[aria-label="Lijst Boodschappen verwijderen"]')
      .trigger("click");
    await nextTick();
    return wrapper;
  }

  function confirmDialog(w: VueWrapper) {
    return w.findAll("dialog").find((d) => d.attributes("open") !== undefined);
  }

  it("verwijderen: exacte teksten, aria-modal en de focus in het veld", async () => {
    const w = await openConfirm();
    const dialog = confirmDialog(w);
    expect(dialog?.attributes("aria-modal")).toBe("true");
    expect(dialog?.get("h2").text()).toBe(
      "Voer lijsttitel in om de lijst te verwijderen",
    );
    expect(dialog?.get("label").text()).toBe("Lijsttitel");
    expect(dialog?.findAll("button").map((b) => b.text())).toEqual([
      "Annuleren",
      "Verwijderen",
    ]);
    expect(document.activeElement).toBe(w.get("#confirm-list-input").element);
  });

  it("verwijderen: een verkeerde titel toont een inline fout en verwijdert niets", async () => {
    const w = await openConfirm();
    await w.get("#confirm-list-input").setValue("boodschappen");
    await confirmDialog(w)?.get("form").trigger("submit");
    expect(mockDeleteList).not.toHaveBeenCalled();
    expect(w.get('[role="alert"]').text()).toBe("Titel komt niet overeen");
    expect(w.get("#confirm-list-input").attributes("aria-invalid")).toBe(
      "true",
    );
  });

  it("verwijderen: de exacte titel (na trim) verwijdert de lijst", async () => {
    const w = await openConfirm();
    const id = lists.value[0]?.id;
    await w.get("#confirm-list-input").setValue("  Boodschappen ");
    await confirmDialog(w)?.get("form").trigger("submit");
    expect(mockDeleteList).toHaveBeenCalledWith(id);
    expect(w.find("#confirm-list-input").exists()).toBe(false);
  });

  it("verwijderen: ESC, klik buiten en de terugknop sluiten zonder actie", async () => {
    let w = await openConfirm();
    confirmDialog(w)?.element.dispatchEvent(
      new Event("cancel", { cancelable: true }),
    );
    await nextTick();
    expect(w.find("#confirm-list-input").exists()).toBe(false);
    w.unmount();

    w = await openConfirm();
    const dialog = confirmDialog(w);
    await dialog?.trigger("pointerdown");
    await dialog?.trigger("click");
    expect(w.find("#confirm-list-input").exists()).toBe(false);
    w.unmount();

    wrapper = w = await openConfirm();
    expect(handleBack()).toBe(true);
    await nextTick();
    expect(w.find("#confirm-list-input").exists()).toBe(false);
    expect(mockDeleteList).not.toHaveBeenCalled();
  });
});
