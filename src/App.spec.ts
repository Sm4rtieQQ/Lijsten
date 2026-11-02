import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";

const { auth, lists, mockBindSyncUser, backFallback } = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown>,
  mockBindSyncUser: vi.fn(),
  backFallback: { current: null as null | (() => boolean) },
}));

vi.mock("./composables/useBackNavigation", () => ({
  initBackButton: (fallback: () => boolean) => {
    backFallback.current = fallback;
    return Promise.resolve();
  },
  disposeBackButton: vi.fn(),
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

describe("App — terugknop op de auth-schermen (AGENTS.md §8.13)", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    vi.useRealTimers();
  });

  /** Mount en laat de minimumtoonduur van het laadscherm verstrijken. */
  async function mountPastSplash(): Promise<() => boolean> {
    vi.useFakeTimers();
    wrapper = shallowMount(App);
    await vi.advanceTimersByTimeAsync(500);
    const fallback = backFallback.current;
    if (!fallback) throw new Error("initBackButton is niet aangeroepen");
    return fallback;
  }

  it("verificatiescherm → terug naar inloggen", async () => {
    const back = await mountPastSplash();
    const verificationEmail = auth.verificationEmail as { value: unknown };
    verificationEmail.value = "piet@voorbeeld.nl";
    expect(back()).toBe(true);
    expect(verificationEmail.value).toBeNull();
  });

  it("herstelscherm → terug (recovery uit)", async () => {
    const back = await mountPastSplash();
    const recovery = auth.recovery as { value: boolean };
    recovery.value = true;
    expect(back()).toBe(true);
    expect(recovery.value).toBe(false);
  });

  it("inlogscherm of ingelogd zonder open scherm → niet afgehandeld (minimaliseren)", async () => {
    const back = await mountPastSplash();
    expect(back()).toBe(false);
    user.value = { id: "a" };
    await nextTick();
    expect(back()).toBe(false);
  });
});
