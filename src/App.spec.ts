import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";

const { auth, lists, mockBindSyncUser } = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown>,
  mockBindSyncUser: vi.fn(),
}));

vi.mock("./composables/useAuth", () => ({ useAuth: () => auth }));
vi.mock("./composables/useLists", () => ({ useLists: () => lists }));
vi.mock("./composables/useSync", () => ({ bindSyncUser: mockBindSyncUser }));
vi.mock("./composables/useDeepLink", () => ({
  useDeepLink: () => ({}),
  initDeepLink: vi.fn(),
}));

import App from "./App.vue";

const user = ref<{ id: string } | null>(null);
const hydrate = vi.fn(() => Promise.resolve());
const reset = vi.fn();

beforeEach(() => {
  user.value = null;
  hydrate.mockClear();
  reset.mockClear();
  mockBindSyncUser.mockClear();
  Object.assign(auth, {
    user,
    initialized: ref(true),
    recovery: ref(false),
    verificationEmail: ref(null),
    justVerified: ref(false),
    init: vi.fn(),
    setJustVerified: vi.fn(),
  });
  Object.assign(lists, {
    activeListId: ref(null),
    hydrate,
    reset,
    refreshData: vi.fn(),
  });
});

describe("App — sessiewissel (AGENTS.md §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => wrapper?.unmount());

  it("hydrateert niet opnieuw bij een nieuw sessie-object van dezelfde gebruiker", async () => {
    wrapper = shallowMount(App);
    reset.mockClear(); // bij het opstarten zonder sessie wordt altijd één keer geleegd
    user.value = { id: "a" };
    await nextTick();
    expect(hydrate).toHaveBeenCalledTimes(1);

    // Zoals supabase-js doet bij terugkeer naar de app (SIGNED_IN/TOKEN_REFRESHED).
    user.value = { id: "a" };
    await nextTick();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("reset en hydrateert wel bij een andere gebruiker, en reset bij uitloggen", async () => {
    wrapper = shallowMount(App);
    reset.mockClear(); // bij het opstarten zonder sessie wordt altijd één keer geleegd
    user.value = { id: "a" };
    await nextTick();
    user.value = { id: "b" };
    await nextTick();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenLastCalledWith("b");

    user.value = null;
    await nextTick();
    expect(reset).toHaveBeenCalledTimes(2);
    expect(mockBindSyncUser).toHaveBeenLastCalledWith(null);
  });
});
