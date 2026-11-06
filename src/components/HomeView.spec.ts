import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import type { User } from "@supabase/supabase-js";

import HomeView from "./HomeView.vue";
import { useAuth } from "../composables/useAuth";
import { handleBack } from "../composables/useBackNavigation";
import { useLists } from "../composables/useLists";
import { createList } from "../types/app";

const AUTH = useAuth();

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
    expect(wrapper.get(".account-panel").attributes("hidden")).toBeDefined();

    await wrapper.get(".icon-button").trigger("click");

    expect(wrapper.get(".account-panel").attributes("hidden")).toBeUndefined();
    const items = wrapper
      .findAll(".account-panel > *")
      .map((el) => el.text().trim())
      .filter(Boolean);
    expect(items).toEqual([
      "+ Nieuw lijstje",
      "Account",
      "piet@voorbeeld.nl",
      "Uitloggen",
    ]);
  });

  it("markeert de accountknop als actief en zet aria-expanded", async () => {
    wrapper = mount(HomeView);
    const button = wrapper.get(".icon-button");
    expect(button.classes()).not.toContain("is-active");
    expect(button.attributes("aria-expanded")).toBe("false");

    await button.trigger("click");
    expect(button.classes()).toContain("is-active");
    expect(button.attributes("aria-expanded")).toBe("true");
    expect(button.attributes("aria-controls")).toBe("account-panel");
  });

  it("sluit het menu weer bij een tweede klik op de accountknop", async () => {
    wrapper = mount(HomeView);
    const button = wrapper.get(".icon-button");
    await button.trigger("click");
    expect(button.classes()).toContain("is-active");
    await button.trigger("click");
    expect(button.classes()).not.toContain("is-active");
    expect(wrapper.get(".account-panel").attributes("hidden")).toBeDefined();
  });
});

describe("HomeView — Android-terugknop (AGENTS.md §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => wrapper?.unmount());

  it("sluit eerst het open accountmenu; daarna laat hij het door", async () => {
    wrapper = mount(HomeView);
    await wrapper.get(".icon-button").trigger("click");

    expect(handleBack()).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".account-panel").attributes("hidden")).toBeDefined();

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

    const handle = wrapper.get(".list-drag-handle").element;
    handle.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", 80));
    await wrapper.vm.$nextTick();

    const copy = document.querySelector(".drag-ghost .list-card");
    expect(copy?.textContent).toContain("Boodschappen");
    expect(copy?.hasAttribute("data-drag-id")).toBe(false);
    expect(wrapper.findAll(".list-card")[0]?.classes()).toContain("dragging");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".drag-ghost")).toBeNull();
    expect(wrapper.findAll(".list-card")[0]?.classes()).not.toContain(
      "dragging",
    );
  });
});
