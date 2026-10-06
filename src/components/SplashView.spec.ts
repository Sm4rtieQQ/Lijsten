import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import SplashView from "./SplashView.vue";

describe("SplashView (AGENTS.md §8.7)", () => {
  it("toont de apptitel 'Lijstjes' met de oranje streep eronder", () => {
    const wrapper = mount(SplashView);
    expect(wrapper.get("h1.loading-title").text()).toBe("Lijstjes");
    expect(wrapper.find(".loading-rule").exists()).toBe(true);
  });

  it("heeft een spinner en een voorleesbare laadstatus", () => {
    const wrapper = mount(SplashView);
    expect(wrapper.find(".loading-spinner").exists()).toBe(true);
    const section = wrapper.get("section");
    expect(section.attributes("role")).toBe("status");
    expect(section.attributes("aria-busy")).toBe("true");
  });

  it("bevat een visueel verborgen 'Laden…'-tekst voor schermlezers", () => {
    const wrapper = mount(SplashView);
    const hidden = wrapper.get(".visually-hidden");
    expect(hidden.text()).toBe("Laden…");
    expect(hidden.attributes("aria-hidden")).toBeUndefined();
  });
});
