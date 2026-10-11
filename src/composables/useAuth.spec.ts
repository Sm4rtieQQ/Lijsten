import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_NOT_CONFIRMED, NETWORK_ERROR } from "../lib/errorMessages";

const { mockSignUp, mockSignIn, mockResend, mockGetSession } = vi.hoisted(
  () => ({
    mockSignUp: vi.fn(),
    mockSignIn: vi.fn(),
    mockResend: vi.fn(),
    mockGetSession: vi.fn(),
  }),
);

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignIn,
      resend: mockResend,
      signOut: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      setSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      getSession: mockGetSession,
    },
  },
  isSupabaseConfigured: true,
}));

import { useAuth, webRedirectTarget } from "./useAuth";

describe("useAuth — open registratie met e-mailverificatie (AGENTS.md §7.6)", () => {
  const AUTH = useAuth();

  beforeEach(() => {
    mockSignUp.mockReset();
    mockSignIn.mockReset();
    mockResend.mockReset();
    mockGetSession.mockReset();
    // De module-state (singleton) staat tussen tests aan; altijd schoon beginnen.
    AUTH.error.value = null;
    AUTH.initialized.value = false;
    AUTH.user.value = null;
    AUTH.verificationEmail.value = null;
    AUTH.justVerified.value = false;
    AUTH.recovery.value = false;
  });

  afterEach(() => {
    AUTH.error.value = null;
    AUTH.verificationEmail.value = null;
    AUTH.justVerified.value = false;
    AUTH.recovery.value = false;
  });

  it("roept signUp aan met een emailRedirectTo en zet verificationEmail", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: "u1" } },
      error: null,
    });

    const ok = await AUTH.register("  nieuw@voorbeeld.nl  ", "geheim123");

    expect(ok).toBe(true);
    const arg = mockSignUp.mock.calls[0]?.[0];
    expect(arg.email).toBe("nieuw@voorbeeld.nl");
    expect(arg.password).toBe("geheim123");
    expect(arg.options.emailRedirectTo).toBe(
      `${window.location.origin}${window.location.pathname}`,
    );
    expect(AUTH.verificationEmail.value).toBe("nieuw@voorbeeld.nl");
  });

  it("geeft geen sessie: de gebruiker is na registreren niet ingelogd", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: "u1" } },
      error: null,
    });

    await AUTH.register("nieuw@voorbeeld.nl", "geheim123");

    expect(AUTH.user.value).toBeNull();
  });

  it("weigert een te kort wachtwoord zonder signUp", async () => {
    const ok = await AUTH.register("nieuw@voorbeeld.nl", "12345");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(
      "Het wachtwoord moet minimaal 6 tekens hebben.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("mapt een bestaand account naar de NL-tekst", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        message: "User already registered",
        code: "user_already_exists",
      },
    });

    const ok = await AUTH.register("bestaat@voorbeeld.nl", "geheim123");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(
      "Er bestaat al een account met dit e-mailadres.",
    );
  });

  it("toont nooit een ruwe technische fout bij een netwerkstoring", async () => {
    mockSignUp.mockRejectedValue(new TypeError("Failed to fetch"));

    const ok = await AUTH.register("nieuw@voorbeeld.nl", "geheim123");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(NETWORK_ERROR);
  });

  it("stuurt een onbevestigde gebruiker naar de verificatiepagina", async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });

    const ok = await AUTH.signIn("onbevestigd@voorbeeld.nl", "geheim123");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(EMAIL_NOT_CONFIRMED);
    expect(AUTH.verificationEmail.value).toBe("onbevestigd@voorbeeld.nl");
  });

  it("toont een NL-melding bij onjuiste inloggegevens", async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        message: "Invalid login credentials",
        code: "invalid_credentials",
      },
    });

    const ok = await AUTH.signIn("iemand@voorbeeld.nl", "verkeerd");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe("De inloggegevens zijn onjuist.");
  });

  it("toont een netwerkmelding (geen ruwe fout) bij een storing tijdens login", async () => {
    mockSignIn.mockRejectedValue(new TypeError("Failed to fetch"));

    const ok = await AUTH.signIn("iemand@voorbeeld.nl", "geheim123");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(NETWORK_ERROR);
  });

  it("wist verificationEmail bij een geslaagde login", async () => {
    AUTH.verificationEmail.value = "oud@voorbeeld.nl";
    mockSignIn.mockResolvedValue({
      data: { session: { user: { email: "oud@voorbeeld.nl" } }, user: null },
      error: null,
    });

    const ok = await AUTH.signIn("oud@voorbeeld.nl", "geheim123");

    expect(ok).toBe(true);
    expect(AUTH.verificationEmail.value).toBeNull();
  });

  it("vraagt een nieuwe verificatielink aan met type signup", async () => {
    mockResend.mockResolvedValue({ data: {}, error: null });

    const ok = await AUTH.resendVerification("nieuw@voorbeeld.nl");

    expect(ok).toBe(true);
    expect(mockResend).toHaveBeenCalledWith({
      type: "signup",
      email: "nieuw@voorbeeld.nl",
      options: { emailRedirectTo: expect.any(String) },
    });
  });

  it("mapt een rate limit bij resend naar een vriendelijke NL-tekst", async () => {
    mockResend.mockResolvedValue({
      data: {},
      error: {
        message: "Email rate limit exceeded",
        code: "over_email_send_rate_limit",
      },
    });

    const ok = await AUTH.resendVerification("nieuw@voorbeeld.nl");

    expect(ok).toBe(false);
    expect(AUTH.error.value).toBe(
      "Er zijn te veel verzoeken verstuurd. Probeer het later opnieuw.",
    );
  });

  it("biedt geen uitnodigings-API meer aan", () => {
    const api = AUTH as unknown as Record<string, unknown>;
    expect(api.acceptInvite).toBeUndefined();
    expect(api.claimInvite).toBeUndefined();
    expect(typeof api.register).toBe("function");
    expect(typeof api.resendVerification).toBe("function");
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

describe("webRedirectTarget — web-redirect incl. subpad (AGENTS.md §8.12/§10.3)", () => {
  it("neemt het pad mee, zodat een projectpagina onder /Lijsten/ werkt", () => {
    expect(
      webRedirectTarget({
        origin: "https://sm4rtieqq.github.io",
        pathname: "/Lijsten/",
      }),
    ).toBe("https://sm4rtieqq.github.io/Lijsten/");
  });

  it("werkt ook op de root (dev-server)", () => {
    expect(
      webRedirectTarget({ origin: "http://localhost:5173", pathname: "/" }),
    ).toBe("http://localhost:5173/");
  });

  it("geeft null zonder origin (geen location)", () => {
    expect(webRedirectTarget(undefined)).toBeNull();
    expect(webRedirectTarget({})).toBeNull();
  });
});
