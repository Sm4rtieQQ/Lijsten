import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import LoginView from "./LoginView.vue";

describe("LoginView (AGENTS.md §8.9)", () => {
  it("toont alleen het inlogformulier met Inloggen en Wachtwoord vergeten?", () => {
    const wrapper = mount(LoginView);
    const text = wrapper.text();

    expect(text).toContain("Inloggen");
    expect(text).toContain("Wachtwoord vergeten?");
  });

  it("bevat géén registratieknop en géén bevestigingstekst/uitnodigingshint", () => {
    const wrapper = mount(LoginView);
    const text = wrapper.text().toLowerCase();

    expect(text).not.toContain("registr");
    expect(text).not.toContain("account aanmaken");
    expect(text).not.toContain("uitnodiging");
    expect(text).not.toContain("bevestig");
    expect(wrapper.find("button").text()).not.toContain("Aanmelden");
  });
});
