import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiIconButton from "./UiIconButton.vue";

describe("UiIconButton", () => {
  it("gebruikt label als toegankelijke naam en is standaard type=button", () => {
    const wrapper = mount(UiIconButton, { props: { label: "Sluiten" } });
    expect(wrapper.attributes("aria-label")).toBe("Sluiten");
    expect(wrapper.attributes("type")).toBe("button");
  });

  it("zet geen aria-pressed als de knop niet gewapend kan worden", () => {
    const wrapper = mount(UiIconButton, { props: { label: "Account" } });
    expect(wrapper.attributes("aria-pressed")).toBeUndefined();
  });

  it("zet aria-pressed volgens armed (twee-staps, §8.6)", async () => {
    const wrapper = mount(UiIconButton, {
      props: { label: "Item verwijderen", variant: "ghost", armed: false },
    });
    expect(wrapper.attributes("aria-pressed")).toBe("false");

    await wrapper.setProps({ armed: true });
    expect(wrapper.attributes("aria-pressed")).toBe("true");
  });

  it("toont de gewapende stijl via aria-pressed, ook zonder hover (§8.6)", () => {
    const wrapper = mount(UiIconButton, {
      props: { label: "Item verwijderen", variant: "ghost", armed: true },
    });
    const classes = wrapper.classes();
    expect(classes).toContain("aria-pressed:bg-accent");
    expect(classes).toContain("aria-pressed:text-white");
    // Een verborgen (reveal) knop wordt zichtbaar zodra hij gewapend is.
    const revealed = mount(UiIconButton, {
      props: { label: "x", variant: "ghost", armed: true, reveal: true },
    }).classes();
    expect(revealed).toContain("aria-pressed:opacity-100");
  });

  it("geeft aria-expanded en aria-controls door; open is oranje (§8.8)", () => {
    const wrapper = mount(UiIconButton, {
      props: { label: "Account en acties" },
      attrs: { "aria-expanded": true, "aria-controls": "account-panel" },
    });
    expect(wrapper.attributes("aria-expanded")).toBe("true");
    expect(wrapper.attributes("aria-controls")).toBe("account-panel");
    expect(wrapper.classes()).toContain("aria-expanded:bg-accent");
  });

  it("reveal: verborgen tot hover of focus, maar altijd zichtbaar op smal en touch", () => {
    const hidden = mount(UiIconButton, {
      props: { label: "x", variant: "ghost", reveal: true },
    }).classes();
    expect(hidden).toEqual(
      expect.arrayContaining([
        "opacity-0",
        "group-hover:opacity-100",
        "focus:opacity-100",
        "max-sm:opacity-100",
        "pointer-coarse:opacity-100",
      ]),
    );
    const shown = mount(UiIconButton, {
      props: { label: "x", variant: "ghost" },
    }).classes();
    expect(shown).not.toContain("opacity-0");
  });

  it("kan de focus krijgen via focus()", () => {
    const wrapper = mount(UiIconButton, {
      props: { label: "Account" },
      attachTo: document.body,
    });
    (wrapper.vm as unknown as { focus: () => void }).focus();
    expect(document.activeElement).toBe(wrapper.element);
    wrapper.unmount();
  });
});
