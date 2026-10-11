import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import LoginView from "./LoginView.vue";

describe("LoginView (AGENTS.md §8.9)", () => {
  it("toont het inlogformulier met Inloggen en Wachtwoord vergeten?", () => {
    const wrapper = mount(LoginView);
    const text = wrapper.text();

    expect(text).toContain("Inloggen");
    expect(text).toContain("Wachtwoord vergeten?");
  });

  it("toont een Registreren-knop die 'register' emit", async () => {
    const wrapper = mount(LoginView);
    const register = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Registreren"));

    expect(register).toBeDefined();
    await register?.trigger("click");
    expect(wrapper.emitted("register")).toBeTruthy();
  });

  it("bevat geen uitnodigingshint meer", () => {
    const wrapper = mount(LoginView);
    expect(wrapper.text().toLowerCase()).not.toContain("uitnodiging");
  });
});
