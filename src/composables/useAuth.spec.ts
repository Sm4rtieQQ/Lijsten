import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITE_INVALID, INVITE_WRONG_EMAIL } from "../lib/errorMessages";

const { mockRpc, mockSignUp, mockGetSession } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockSignUp: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: mockRpc,
    auth: {
      signUp: mockSignUp,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      onAuthStateChange: vi.fn(),
      getSession: mockGetSession,
    },
  },
  isSupabaseConfigured: true,
}));

import { useAuth } from "./useAuth";

/** Claim-response die een geldige uitnodiging voor een bepaald adres simuleert. */
function validClaim(email: string): void {
  mockRpc.mockResolvedValue({
    data: { valid: true, email },
    error: null,
  });
}

describe("useAuth.acceptInvite (AGENTS.md §7.6)", () => {
  const AUTH = useAuth();

  beforeEach(() => {
    mockRpc.mockReset();
    mockSignUp.mockReset();
    mockGetSession.mockReset();
    // De module-state (singleton) staat tussen tests aan; altijd schoon beginnen.
    AUTH.error.value = null;
    AUTH.initialized.value = false;
    AUTH.user.value = null;
  });

  afterEach(() => {
    AUTH.error.value = null;
  });

  it("roept eerst claim_invite aan en dan pas signUp (volgorde is beveiliging)", async () => {
    const email = "genodigde@voorbeeld.nl";
    validClaim(email);
    mockSignUp.mockResolvedValue({
      data: { session: { user: { email } }, user: null },
      error: null,
    });

    const ok = await AUTH.acceptInvite(email, "geheim123", "TOKEN");

    expect(ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("claim_invite", { in_token: "TOKEN" });
    expect(mockSignUp).toHaveBeenCalledWith({
      email,
      password: "geheim123",
    });
    const rpcOrder = mockRpc.mock.invocationCallOrder[0] ?? -1;
    const signUpOrder = mockSignUp.mock.invocationCallOrder[0] ?? -1;
    expect(rpcOrder).toBeLessThan(signUpOrder);
  });

  it("weigert een ander e-mailadres dan de uitnodiging, zonder signUp", async () => {
    validClaim("genodigde@voorbeeld.nl");

    const ok = await AUTH.acceptInvite(
      "ander@voorbeeld.nl",
      "geheim123",
      "TOKEN",
    );

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(INVITE_WRONG_EMAIL);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("laat cases in het e-mailadres buiten beschouwing (trim + toLowerCase)", async () => {
    validClaim("Genodigde@Voorbeeld.nl");
    mockSignUp.mockResolvedValue({
      data: { session: { user: { email: "genodigde@voorbeeld.nl" } } },
      error: null,
    });

    const ok = await AUTH.acceptInvite(
      "  genodigde@voorbeeld.nl  ",
      "geheim123",
      "TOKEN",
    );

    expect(ok).toBe(true);
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "genodigde@voorbeeld.nl",
      password: "geheim123",
    });
  });

  it("weigert een te kort wachtwoord zonder signUp", async () => {
    validClaim("genodigde@voorbeeld.nl");

    const ok = await AUTH.acceptInvite(
      "genodigde@voorbeeld.nl",
      "12345",
      "TOKEN",
    );

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(
      "Het wachtwoord moet minimaal 6 tekens hebben.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("mapt de triggerfout no_active_invite naar de NL-uitnodigingstekst", async () => {
    validClaim("genodigde@voorbeeld.nl");
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        message: "Database error saving new user",
        code: "no_active_invite",
      },
    });

    const ok = await AUTH.acceptInvite(
      "genodigde@voorbeeld.nl",
      "geheim123",
      "TOKEN",
    );

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(INVITE_INVALID);
  });

  it("biedt geen open signUp aan in de API (registratie alleen via uitnodiging)", () => {
    const api = AUTH as unknown as Record<string, unknown>;
    expect("signUp" in api).toBe(false);
    expect(api.signUp).toBeUndefined();
    // Alleen acceptInvite is de weg naar een account.
    expect(typeof api.acceptInvite).toBe("function");
  });

  it("init() zet de gebruiker en initialized-status vanuit de sessie (A2)", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: "ingelogd@voorbeeld.nl" } } },
      error: null,
    });

    // Verse `initStarted`-guard: init() is per gebruik van useAuth() eenmalig.
    const auth = useAuth();
    await auth.init();

    expect(auth.initialized.value).toBe(true);
    expect(auth.user.value?.email).toBe("ingelogd@voorbeeld.nl");
  });

  it("init() zet initialized altijd op true, ook als getSession faalt (laadscherm-vangnet)", async () => {
    mockGetSession.mockRejectedValue(new TypeError("Failed to fetch"));

    const auth = useAuth();
    // init() zelf reject (App.vue gebruikt `void init()`), maar de `finally`
    // zet `initialized` altijd op true zodat het laadscherm nooit blijft hangen.
    await expect(auth.init()).rejects.toBeInstanceOf(TypeError);

    expect(auth.initialized.value).toBe(true);
    expect(auth.user.value).toBeNull();
  });
});
