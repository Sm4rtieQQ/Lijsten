import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import SplashView from "./SplashView.vue";

describe("SplashView (AGENTS.md §8.7)", () => {
  it("toont de apptitel 'Lijstjes' met de oranje streep eronder", () => {
    const wrapper = mount(SplashView);
    expect(wrapper.get("h1").text()).toBe("Lijstjes");
    expect(wrapper.find("[data-testid=splash-rule]").exists()).toBe(true);
  });

  it("heeft een spinner en een voorleesbare laadstatus", () => {
    const wrapper = mount(SplashView);
    expect(wrapper.find("[data-testid=splash-spinner]").exists()).toBe(true);
    const section = wrapper.get("section");
    expect(section.attributes("role")).toBe("status");
    expect(section.attributes("aria-busy")).toBe("true");
  });

  it("bevat een visueel verborgen 'Laden…'-tekst voor schermlezers", () => {
    const wrapper = mount(SplashView);
    const hidden = wrapper.get(".sr-only");
    expect(hidden.text()).toBe("Laden…");
    expect(hidden.attributes("aria-hidden")).toBeUndefined();
  });
});
