import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiField from "./UiField.vue";
import UiInput from "./UiInput.vue";

describe("UiField", () => {
  it("omsluit het veld met een label, zodat het label de naam is", () => {
    const wrapper = mount(UiField, {
      props: { label: "E-mailadres" },
      slots: { default: UiInput },
    });
    const label = wrapper.get("label");
    expect(label.text()).toBe("E-mailadres");
    expect(label.find("input").exists()).toBe(true);
  });

  it("is standaard vet en donker, met tone=muted grijs", () => {
    const ink = mount(UiField, { props: { label: "x" } }).classes();
    expect(ink).toContain("text-ink");

    const muted = mount(UiField, {
      props: { label: "x", tone: "muted" },
    }).classes();
    expect(muted).toContain("text-muted");
  });
});
