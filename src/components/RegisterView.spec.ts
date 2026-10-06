import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { mockRpc, mockSignUp } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockSignUp: vi.fn(),
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
      getSession: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}));

import RegisterView from "./RegisterView.vue";
import {
  __resetDeepLinkState,
  handleIncomingUrl,
} from "../composables/useDeepLink";
import { useAuth } from "../composables/useAuth";

const AUTH = useAuth();

/** Zet een geldige uitnodiging klaar (claim antwoordt met het juiste e-mailadres). */
function validClaim(email: string): void {
  mockRpc.mockResolvedValue({
    data: { valid: true, email },
    error: null,
  });
}

async function fillAndSubmit(
  wrapper: ReturnType<typeof mount>,
  password = "geheim123",
  repeat = password,
): Promise<void> {
  await wrapper.find('input[aria-label="Wachtwoord"]').setValue(password);
  await wrapper
    .find('input[aria-label="Wachtwoord herhalen"]')
    .setValue(repeat);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
}

describe("RegisterView (registratie via uitnodiging, AGENTS.md §7.6)", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockSignUp.mockReset();
    __resetDeepLinkState();
    AUTH.error.value = null;
  });

  afterEach(() => {
    AUTH.error.value = null;
  });

  it("toont bij een ongeldige link een NL-melding en roept nooit signUp aan", async () => {
    const wrapper = mount(RegisterView);
    await flushPromises();

    expect(wrapper.get(".login-message").text()).toContain(
      "Deze link is niet (meer) geldig. Vraag een nieuwe uitnodiging.",
    );

    // Zelfs een volledig ingevuld formulier levert niets op zonder token.
    await wrapper.find('input[type="email"]').setValue("iemand@voorbeeld.nl");
    await fillAndSubmit(wrapper);

    expect(wrapper.get(".login-message").text()).toBe(
      "Deze uitnodiging is ongeldig of verlopen.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("vult het e-mailadres uit de uitnodiging en signUp gebruikt dát adres", async () => {
    const email = "genodigde@voorbeeld.nl";
    validClaim(email);
    mockSignUp.mockResolvedValue({
      data: { session: { user: { email } } },
      error: null,
    });

    await handleIncomingUrl(`http://localhost:5173/?invite=TOKEN-123`);
    const wrapper = mount(RegisterView);
    await flushPromises();

    const emailInput = wrapper.find('input[type="email"]');
    expect((emailInput.element as HTMLInputElement).value).toBe(email);
    // Het adres uit de uitnodiging is niet meer te wijzigen.
    expect(emailInput.attributes("readonly")).toBeDefined();

    await fillAndSubmit(wrapper, "geheim123");

    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(mockSignUp).toHaveBeenCalledWith({
      email,
      password: "geheim123",
    });
  });

  it("geeft een inline fout bij verschillende wachtwoorden, zonder signUp", async () => {
    validClaim("genodigde@voorbeeld.nl");
    await handleIncomingUrl(`http://localhost:5173/?invite=TOKEN-123`);
    const wrapper = mount(RegisterView);
    await flushPromises();

    await fillAndSubmit(wrapper, "geheim123", "geheim124");

    expect(wrapper.get(".login-message").text()).toBe(
      "De wachtwoorden verschillen.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("geeft een inline fout bij een wachtwoord korter dan 6 tekens, zonder signUp", async () => {
    validClaim("genodigde@voorbeeld.nl");
    await handleIncomingUrl(`http://localhost:5173/?invite=TOKEN-123`);
    const wrapper = mount(RegisterView);
    await flushPromises();

    await fillAndSubmit(wrapper, "12345");

    expect(wrapper.get(".login-message").text()).toBe(
      "Het wachtwoord moet minimaal 6 tekens hebben.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("vertaalt de no_active_invite-triggerfout naar de NL-uitnodigingstekst", async () => {
    const email = "genodigde@voorbeeld.nl";
    validClaim(email);
    mockRpc.mockResolvedValue({
      data: { valid: true, email },
      error: null,
    });
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: {
        message: "Database error saving new user",
        code: "no_active_invite",
      },
    });

    await handleIncomingUrl(`http://localhost:5173/?invite=TOKEN-123`);
    const wrapper = mount(RegisterView);
    await flushPromises();

    await fillAndSubmit(wrapper, "geheim123");

    expect(wrapper.get(".login-message").text()).toBe(
      "Deze uitnodiging is ongeldig of verlopen.",
    );
  });
});
