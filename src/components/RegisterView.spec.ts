import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: vi.fn(),
      resend: vi.fn(),
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

import RegisterView from "./RegisterView.vue";
import { useAuth } from "../composables/useAuth";

const AUTH = useAuth();

async function submit(
  wrapper: ReturnType<typeof mount>,
  email: string,
  password = "geheim123",
  repeat = password,
): Promise<void> {
  await wrapper.find('input[type="email"]').setValue(email);
  await wrapper.find('input[aria-label="Wachtwoord"]').setValue(password);
  await wrapper
    .find('input[aria-label="Wachtwoord herhalen"]')
    .setValue(repeat);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
}

describe("RegisterView — open registratie (AGENTS.md §7.6)", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    AUTH.error.value = null;
    AUTH.verificationEmail.value = null;
  });

  afterEach(() => {
    AUTH.error.value = null;
    AUTH.verificationEmail.value = null;
  });

  it("laat het e-mailadres vrij invulbaar (geen uitnodiging meer)", async () => {
    const wrapper = mount(RegisterView);
    const emailInput = wrapper.find('input[type="email"]');

    expect(emailInput.attributes("readonly")).toBeUndefined();
    expect(wrapper.text()).not.toContain("uitnodiging");
  });

  it("roept signUp aan met het ingevulde adres en zet verificationEmail", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: { id: "u1" } },
      error: null,
    });

    const wrapper = mount(RegisterView);
    await submit(wrapper, "nieuw@voorbeeld.nl");

    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(mockSignUp.mock.calls[0]?.[0]).toMatchObject({
      email: "nieuw@voorbeeld.nl",
      password: "geheim123",
    });
    expect(AUTH.verificationEmail.value).toBe("nieuw@voorbeeld.nl");
  });

  it("geeft een inline fout bij verschillende wachtwoorden, zonder signUp", async () => {
    const wrapper = mount(RegisterView);
    await submit(wrapper, "nieuw@voorbeeld.nl", "geheim123", "geheim124");

    expect(wrapper.get(".login-message").text()).toBe(
      "De wachtwoorden verschillen.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("geeft een inline fout bij een wachtwoord korter dan 6 tekens", async () => {
    const wrapper = mount(RegisterView);
    await submit(wrapper, "nieuw@voorbeeld.nl", "12345");

    expect(wrapper.get(".login-message").text()).toBe(
      "Het wachtwoord moet minimaal 6 tekens hebben.",
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("toont een NL-melding bij een bestaand account (geen ruwe fout)", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        message: "User already registered",
        code: "user_already_exists",
      },
    });

    const wrapper = mount(RegisterView);
    await submit(wrapper, "bestaat@voorbeeld.nl");

    expect(wrapper.get(".login-message").text()).toBe(
      "Er bestaat al een account met dit e-mailadres.",
    );
  });

  it("heeft op beide wachtwoordvelden een oogje dat de zichtbaarheid wisselt", async () => {
    const wrapper = mount(RegisterView);

    const password = wrapper.get('input[aria-label="Wachtwoord"]');
    const repeat = wrapper.get('input[aria-label="Wachtwoord herhalen"]');
    const toggles = wrapper.findAll(".toggle-password-button");

    expect(password.attributes("type")).toBe("password");
    expect(repeat.attributes("type")).toBe("password");
    // Eén oogje per wachtwoordveld.
    expect(toggles).toHaveLength(2);

    await toggles[0]?.trigger("click");
    expect(
      wrapper.get('input[aria-label="Wachtwoord"]').attributes("type"),
    ).toBe("text");
    // Het herhaalveld blijft onafhankelijk verborgen.
    expect(
      wrapper.get('input[aria-label="Wachtwoord herhalen"]').attributes("type"),
    ).toBe("password");

    await toggles[1]?.trigger("click");
    expect(
      wrapper.get('input[aria-label="Wachtwoord herhalen"]').attributes("type"),
    ).toBe("text");
  });

  it("emit 'cancel' via de terug-knop", async () => {
    const wrapper = mount(RegisterView);
    await wrapper.get("button.forgot-password").trigger("click");

    expect(wrapper.emitted("cancel")).toBeTruthy();
  });
});
