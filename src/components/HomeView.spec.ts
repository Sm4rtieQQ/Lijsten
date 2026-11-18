import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import type { User } from "@supabase/supabase-js";

import HomeView from "./HomeView.vue";
import { useAuth } from "../composables/useAuth";
import { handleBack } from "../composables/useBackNavigation";
import { useLists } from "../composables/useLists";
import { createList } from "../types/app";

const AUTH = useAuth();
const ACCOUNT_BUTTON = 'button[aria-label="Account en acties"]';

describe("HomeView (accountmenu, AGENTS.md §8.8)", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    AUTH.user.value = { email: "piet@voorbeeld.nl" } as unknown as User;
    AUTH.error.value = null;
  });

  afterEach(() => {
    wrapper?.unmount();
    AUTH.user.value = null;
  });

  it("toont het accountmenu in de exacte volgorde bij openen", async () => {
    wrapper = mount(HomeView);
    // Menu is standaard gesloten.
    expect(wrapper.get("#account-panel").attributes("hidden")).toBeDefined();

    await wrapper.get(ACCOUNT_BUTTON).trigger("click");

    expect(wrapper.get("#account-panel").attributes("hidden")).toBeUndefined();
    const items = wrapper
      .findAll("#account-panel > *")
      .map((el) => el.text().trim())
      .filter(Boolean);
    expect(items).toEqual([
      "+ Nieuw lijstje",
      "Account",
      "piet@voorbeeld.nl",
      "Uitloggen",
    ]);
  });

  it("zet aria-expanded op de accountknop (de oranje stijl hangt daaraan)", async () => {
    wrapper = mount(HomeView);
    const button = wrapper.get(ACCOUNT_BUTTON);
    expect(button.attributes("aria-expanded")).toBe("false");

    await button.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("true");
    expect(button.attributes("aria-controls")).toBe("account-panel");
  });

  it("sluit het menu weer bij een tweede klik op de accountknop", async () => {
    wrapper = mount(HomeView);
    const button = wrapper.get(ACCOUNT_BUTTON);
    await button.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("true");
    await button.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("#account-panel").attributes("hidden")).toBeDefined();
  });
});

describe("HomeView — Android-terugknop (AGENTS.md §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => wrapper?.unmount());

  it("sluit eerst het open accountmenu; daarna laat hij het door", async () => {
    wrapper = mount(HomeView);
    await wrapper.get(ACCOUNT_BUTTON).trigger("click");

    expect(handleBack()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get("#account-panel").attributes("hidden")).toBeDefined();

    // Niets meer open → niet afgehandeld (App minimaliseert dan de app).
    expect(handleBack()).toBe(false);
  });

  it("meldt zich af bij unmount", () => {
    wrapper = mount(HomeView);
    wrapper.unmount();
    wrapper = undefined;
    expect(handleBack()).toBe(false);
  });
});

describe("HomeView — slepen met zwevende kopie (AGENTS.md §8.15)", () => {
  const { lists } = useLists();
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    lists.value = [];
  });

  function pointer(type: string, y: number): Event {
    const event = new MouseEvent(type, {
      clientY: y,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  }

  it("toont een kopie van de kaart; het origineel blijft als placeholder; ESC breekt af", async () => {
    lists.value = [createList("Boodschappen"), createList("Klussen")];
    wrapper = mount(HomeView, { attachTo: document.body });

    const handle = wrapper.get("[data-drag-handle]").element;
    handle.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", 80));
    await wrapper.vm.$nextTick();

    const copy = document.querySelector("[data-drag-ghost] article");
    expect(copy?.textContent).toContain("Boodschappen");
    expect(copy?.hasAttribute("data-drag-id")).toBe(false);
    expect(
      wrapper.findAll("[data-drag-id]")[0]?.attributes("data-dragging"),
    ).toBeDefined();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector("[data-drag-ghost]")).toBeNull();
    expect(
      wrapper.findAll("[data-drag-id]")[0]?.attributes("data-dragging"),
    ).toBeUndefined();
  });
});
