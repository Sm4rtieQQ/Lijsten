import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiSpinner from "./UiSpinner.vue";

describe("UiSpinner", () => {
  it("is decoratief: verborgen voor schermlezers", () => {
    const wrapper = mount(UiSpinner);
    expect(wrapper.attributes("aria-hidden")).toBe("true");
  });

  it("is standaard klein en kent een grote variant", () => {
    expect(mount(UiSpinner).attributes("data-size")).toBe("sm");
    expect(
      mount(UiSpinner, { props: { size: "lg" } }).attributes("data-size"),
    ).toBe("lg");
  });

  it("laat layoutklassen van de aanroeper door", () => {
    const wrapper = mount(UiSpinner, { attrs: { class: "fixed right-6" } });
    expect(wrapper.classes()).toContain("fixed");
  });
});
