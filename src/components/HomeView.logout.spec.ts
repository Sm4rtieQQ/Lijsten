import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { User } from "@supabase/supabase-js";

const { mockFlushBeforeSignOut, mockSignOut } = vi.hoisted(() => ({
  mockFlushBeforeSignOut: vi.fn<() => Promise<boolean>>(),
  mockSignOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("../composables/useSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../composables/useSync")>()),
  flushBeforeSignOut: mockFlushBeforeSignOut,
}));
vi.mock("../composables/useAuth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../composables/useAuth")>();
  return {
    ...mod,
    useAuth: () => ({ ...mod.useAuth(), signOut: mockSignOut }),
  };
});

import HomeView from "./HomeView.vue";
import { useAuth } from "../composables/useAuth";

const AUTH = useAuth();

describe("HomeView — uitloggen met niet-verstuurde wijzigingen (AGENTS.md §7.3)", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    AUTH.user.value = { email: "piet@voorbeeld.nl" } as unknown as User;
    mockFlushBeforeSignOut.mockReset();
    mockSignOut.mockClear();
  });
  afterEach(() => {
    wrapper?.unmount();
    AUTH.user.value = null;
  });

  async function openMenu(): Promise<VueWrapper> {
    const w = mount(HomeView);
    await w.get(".icon-button").trigger("click");
    return w;
  }

  it("alles verstuurd → logt meteen uit", async () => {
    mockFlushBeforeSignOut.mockResolvedValue(true);
    wrapper = await openMenu();
    await wrapper.get(".panel-logout").trigger("click");
    await flushPromises();
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it("niet alles verstuurd → eerst bevestigen, de tweede klik logt uit", async () => {
    mockFlushBeforeSignOut.mockResolvedValue(false);
    wrapper = await openMenu();
    const logout = wrapper.get(".panel-logout");

    await logout.trigger("click");
    await flushPromises();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(logout.classes()).toContain("is-armed");
    expect(logout.text()).toBe("Toch uitloggen");
    expect(logout.attributes("aria-pressed")).toBe("true");
    expect(wrapper.get(".panel-note").text()).toContain(
      "Niet alle wijzigingen zijn verstuurd",
    );

    await logout.trigger("click");
    await flushPromises();
    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(mockFlushBeforeSignOut).toHaveBeenCalledOnce();
  });

  it("menu sluiten heft de bevestiging op", async () => {
    mockFlushBeforeSignOut.mockResolvedValue(false);
    wrapper = await openMenu();
    await wrapper.get(".panel-logout").trigger("click");
    await flushPromises();
    await wrapper.get(".icon-button").trigger("click"); // menu dicht
    await wrapper.get(".icon-button").trigger("click"); // weer open
    expect(wrapper.get(".panel-logout").classes()).not.toContain("is-armed");
    expect(wrapper.find(".panel-note").exists()).toBe(false);
  });
});
