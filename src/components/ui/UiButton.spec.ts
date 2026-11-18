import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import UiButton from "./UiButton.vue";

describe("UiButton", () => {
  it("is standaard een gewone knop (geen submit)", () => {
    const wrapper = mount(UiButton, { slots: { default: "Opslaan" } });
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.text()).toBe("Opslaan");
  });

  it("geeft type, disabled en klikken door", async () => {
    const wrapper = mount(UiButton, {
      props: { type: "submit" },
      attrs: { disabled: true },
    });
    expect(wrapper.attributes("type")).toBe("submit");
    expect(wrapper.attributes("disabled")).toBeDefined();

    const enabled = mount(UiButton);
    await enabled.trigger("click");
    expect(enabled.emitted("click")).toHaveLength(1);
  });

  it("zet geen aria-pressed als de knop niet gewapend kan worden", () => {
    const wrapper = mount(UiButton);
    expect(wrapper.attributes("aria-pressed")).toBeUndefined();
  });

  it("zet aria-pressed volgens armed (twee-staps, §8.6)", async () => {
    const wrapper = mount(UiButton, { props: { armed: false } });
    expect(wrapper.attributes("aria-pressed")).toBe("false");

    await wrapper.setProps({ armed: true });
    expect(wrapper.attributes("aria-pressed")).toBe("true");
  });

  it("toont de gewapende stijl via aria-pressed, ook zonder hover (§8.6)", () => {
    const wrapper = mount(UiButton, {
      props: { variant: "text", armed: true },
    });
    const classes = wrapper.classes();
    expect(classes).toContain("aria-pressed:bg-accent");
    expect(classes).toContain("aria-pressed:text-white");
  });

  it("zet het icoon vóór de tekst en de #trailing-inhoud erachter", () => {
    const wrapper = mount(UiButton, {
      slots: {
        icon: '<svg data-icon=""></svg>',
        default: "Verder",
        trailing: "&#8594;",
      },
    });
    const html = wrapper.element.innerHTML;
    const icon = html.indexOf("data-icon");
    const label = html.indexOf("Verder");
    const arrow = html.indexOf("→");
    expect(icon).toBeGreaterThanOrEqual(0);
    expect(icon).toBeLessThan(label);
    expect(label).toBeLessThan(arrow);
    expect(wrapper.get("span").text()).toBe("→");
  });

  it("rendert geen lege span zonder #trailing", () => {
    const wrapper = mount(UiButton, { slots: { default: "Verder" } });
    expect(wrapper.find("span").exists()).toBe(false);
  });

  const VARIANTS = [
    "primary",
    "secondary",
    "text",
    "text-muted",
    "outline",
    "danger",
  ] as const;

  it.each(VARIANTS)("variant %s heeft een eigen uiterlijk", (variant) => {
    const own = mount(UiButton, { props: { variant } }).classes();
    const others = VARIANTS.filter((other) => other !== variant).map((other) =>
      mount(UiButton, { props: { variant: other } })
        .classes()
        .join(" "),
    );
    expect(others).not.toContain(own.join(" "));
  });
});
