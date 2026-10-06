import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import type { User } from "@supabase/supabase-js";

import HomeView from "./HomeView.vue";
import { useAuth } from "../composables/useAuth";

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
