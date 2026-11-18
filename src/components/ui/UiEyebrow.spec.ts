import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiEyebrow from "./UiEyebrow.vue";

describe("UiEyebrow", () => {
  it("toont de slot-tekst in een alinea", () => {
    const wrapper = mount(UiEyebrow, { slots: { default: "OVERZICHT" } });
    expect(wrapper.element.tagName).toBe("P");
    expect(wrapper.text()).toBe("OVERZICHT");
  });

  it("is standaard normaal en kent een kleine variant", () => {
    expect(mount(UiEyebrow).attributes("data-size")).toBe("md");
    expect(
      mount(UiEyebrow, { props: { size: "sm" } }).attributes("data-size"),
    ).toBe("sm");
  });

  it("laat layoutklassen van de aanroeper door", () => {
    const wrapper = mount(UiEyebrow, { attrs: { class: "mb-[7px]" } });
    expect(wrapper.classes()).toContain("mb-[7px]");
  });
});
