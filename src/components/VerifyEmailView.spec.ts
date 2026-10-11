import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { mockResend } = vi.hoisted(() => ({ mockResend: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      resend: mockResend,
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      setSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}));

import VerifyEmailView from "./VerifyEmailView.vue";
import { useAuth } from "../composables/useAuth";

const AUTH = useAuth();

describe("VerifyEmailView (AGENTS.md §7.6)", () => {
  beforeEach(() => {
    mockResend.mockReset();
    AUTH.error.value = null;
    AUTH.verificationEmail.value = "nieuw@voorbeeld.nl";
  });

  afterEach(() => {
    AUTH.error.value = null;
    AUTH.verificationEmail.value = null;
  });

  it("toont de exacte instructietekst met het e-mailadres", () => {
    const wrapper = mount(VerifyEmailView);

    expect(wrapper.text()).toContain(
      "Er is een email verzonden naar nieuw@voorbeeld.nl. Klik op de link in de mail om uw account te accepteren.",
    );
  });

  it("vraagt een nieuwe link aan en blokkeert daarna de knop (cooldown)", async () => {
    mockResend.mockResolvedValue({ data: {}, error: null });

    const wrapper = mount(VerifyEmailView);
    const button = wrapper.get("button.button-secondary");

    await button.trigger("click");
    await flushPromises();

    expect(mockResend).toHaveBeenCalledWith({
      type: "signup",
      email: "nieuw@voorbeeld.nl",
      options: { emailRedirectTo: expect.any(String) },
    });
    expect(wrapper.get(".login-message").text()).toBe(
      "Er is een nieuwe verificatielink verstuurd.",
    );
    expect(button.attributes("disabled")).toBeDefined();

    // Een tweede klik binnen de cooldown doet niets.
    await button.trigger("click");
    expect(mockResend).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("emit 'back' via de terug-knop", async () => {
    const wrapper = mount(VerifyEmailView);
    await wrapper.get("button.forgot-password").trigger("click");

    expect(wrapper.emitted("back")).toBeTruthy();
  });
});
