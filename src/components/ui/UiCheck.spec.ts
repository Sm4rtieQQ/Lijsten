import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiCheck from "./UiCheck.vue";

describe("UiCheck (AGENTS.md §8.5)", () => {
  it("is een knop met label als toegankelijke naam", () => {
    const wrapper = mount(UiCheck, {
      props: { checked: false, label: "Item afvinken" },
    });
    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.attributes("aria-label")).toBe("Item afvinken");
  });

  it("zet data-checked alleen als het vakje aangevinkt is", async () => {
    const wrapper = mount(UiCheck, {
      props: { checked: false, label: "Item afvinken" },
    });
    expect(wrapper.attributes("data-checked")).toBeUndefined();

    await wrapper.setProps({ checked: true });
    expect(wrapper.attributes("data-checked")).toBeDefined();
  });

  it("is een vierkant met afgeronde hoeken, nooit rond", () => {
    const classes = mount(UiCheck, {
      props: { checked: true, label: "x" },
    }).classes();
    expect(classes).toContain("rounded-check");
    expect(classes).not.toContain("rounded-full");
  });

  it("meldt een klik", async () => {
    const wrapper = mount(UiCheck, { props: { checked: false, label: "x" } });
    await wrapper.trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });
});
