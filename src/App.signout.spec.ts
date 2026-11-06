import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";

const { mockOnAuthStateChange, mockGetSession, mockSignOut } = vi.hoisted(
  () => ({
    mockOnAuthStateChange: vi.fn(),
    mockGetSession: vi.fn(),
    mockSignOut: vi.fn(),
  }),
);

vi.mock("./lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  },
  isSupabaseConfigured: true,
}));
// Geen echte sync: alleen de lokale cache en outbox zijn hier van belang.
vi.mock("./composables/useSync", () => ({
  markDirty: vi.fn(),
  registerPuller: vi.fn(),
  syncWithServer: vi.fn(() => Promise.resolve()),
  syncWithServerIfStale: vi.fn(() => Promise.resolve()),
  bindSyncUser: vi.fn(),
  flushNow: vi.fn(() => Promise.resolve(true)),
  flushBeforeSignOut: vi.fn(() => Promise.resolve(true)),
}));

import App from "./App.vue";
import { useAuth } from "./composables/useAuth";
import { useLists } from "./composables/useLists";
import { readAuthLog } from "./lib/authLog";
import { loadLists, loadQueue } from "./lib/storage";

const STUBS = {
  HomeView: true,
  ListDetailView: true,
  LoginView: true,
  PullToRefresh: true,
  RegisterView: true,
  ResetPasswordView: true,
  SplashView: true,
  VerifyEmailView: true,
};

type Listener = (event: string, session: unknown) => void;

const A = { id: "user-a" };
const B = { id: "user-b" };

describe("App — sessie-einde en lokale gegevens (AGENTS.md §7.1/§7.3)", () => {
  let wrapper: VueWrapper | undefined;
  let emit: Listener;
  const LISTS = useLists();
  const AUTH = useAuth();

  async function signInAs(user: { id: string }): Promise<void> {
    emit("SIGNED_IN", { user });
    await flushPromises();
  }

  beforeEach(async () => {
    localStorage.clear();
    mockOnAuthStateChange.mockReset();
    mockGetSession.mockReset();
    mockSignOut.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    // Zoals supabase-js: signOut() beëindigt de sessie en vuurt SIGNED_OUT.
    mockSignOut.mockImplementation(() => {
      emit("SIGNED_OUT", null);
      return Promise.resolve({ error: null });
    });
    AUTH.user.value = null;
    LISTS.reset();

    wrapper = mount(App, { global: { stubs: STUBS } });
    await flushPromises();
    emit = mockOnAuthStateChange.mock.calls.at(-1)?.[0] as Listener;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    AUTH.user.value = null;
  });

  /** Gebruiker maakt lokaal een lijst die nog niet verstuurd is. */
  async function createUnsyncedList(): Promise<string> {
    const id = LISTS.createNewList("Boodschappen");
    await nextTick();
    return id;
  }

  it("onvrijwillig SIGNED_OUT: cache en outbox van die gebruiker blijven staan", async () => {
    await signInAs(A);
    await createUnsyncedList();
    expect(loadQueue(A.id)).toHaveLength(1);

    emit("SIGNED_OUT", null); // refresh-token geweigerd, sessielimiet, ...
    await flushPromises();

    expect(AUTH.user.value).toBeNull();
    expect(LISTS.lists.value).toEqual([]); // in-memory state is wel weg
    expect(loadQueue(A.id)).toHaveLength(1);
    expect(loadLists(A.id)).toHaveLength(1);
    expect(readAuthLog().at(-1)).toMatchObject({
      event: "SIGNED_OUT",
      userInitiated: false,
    });
  });

  it("dezelfde gebruiker logt opnieuw in en krijgt zijn niet-verstuurde wijziging terug", async () => {
    await signInAs(A);
    const listId = await createUnsyncedList();
    emit("SIGNED_OUT", null);
    await flushPromises();

    await signInAs(A);

    expect(LISTS.lists.value.map((l) => l.id)).toEqual([listId]);
    expect(loadQueue(A.id).map((e) => e.type)).toEqual(["list.create"]);
  });

  it("gebruiker-geïnitieerd uitloggen (signOut) wist cache en outbox, zoals voorheen", async () => {
    await signInAs(A);
    await createUnsyncedList();

    await AUTH.signOut();
    await flushPromises();

    expect(loadQueue(A.id)).toEqual([]);
    expect(loadLists(A.id)).toBeNull();
    expect(LISTS.lists.value).toEqual([]);
    expect(readAuthLog().at(-1)).toMatchObject({
      event: "SIGNED_OUT",
      userInitiated: true,
    });
  });

  it("een eigen uitlog gevolgd door een onvrijwillig einde: het oordeel hoort bij de laatste sessie", async () => {
    await signInAs(A);
    await AUTH.signOut();
    await flushPromises();

    await signInAs(A);
    await createUnsyncedList();
    emit("SIGNED_OUT", null);
    await flushPromises();

    expect(loadQueue(A.id)).toHaveLength(1);
  });

  it("andere gebruiker na een onvrijwillige sign-out: schone state, geen data van A zichtbaar", async () => {
    await signInAs(A);
    await createUnsyncedList();
    emit("SIGNED_OUT", null);
    await flushPromises();

    await signInAs(B);

    // B ziet niets van A, en B's eigen storage is leeg.
    expect(LISTS.lists.value).toEqual([]);
    expect(loadLists(B.id)).toBeNull();
    expect(loadQueue(B.id)).toEqual([]);

    // B's mutaties belanden alleen in B's outbox; A's outbox blijft ongemoeid.
    LISTS.createNewList("Van B");
    expect(loadQueue(B.id)).toHaveLength(1);
    expect(loadQueue(A.id)).toHaveLength(1);

    // B logt zelf uit: alleen B's gegevens verdwijnen, A's wachtende wijziging niet.
    await AUTH.signOut();
    await flushPromises();
    expect(loadQueue(B.id)).toEqual([]);
    expect(loadLists(B.id)).toBeNull();
    expect(loadQueue(A.id)).toHaveLength(1);
    expect(loadLists(A.id)?.map((l) => l.title)).toEqual(["Boodschappen"]);
  });
});
