import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";

import UiInput from "./UiInput.vue";

describe("UiInput", () => {
  it("werkt met v-model in beide richtingen", async () => {
    const wrapper = mount(UiInput, {
      props: {
        modelValue: "eerst",
        "onUpdate:modelValue": (value: string | undefined) =>
          wrapper.setProps({ modelValue: value ?? "" }),
      },
    });
    const input = wrapper.get("input");
    expect(input.element.value).toBe("eerst");

    await input.setValue("daarna");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["daarna"]);

    await wrapper.setProps({ modelValue: "van buiten" });
    expect(input.element.value).toBe("van buiten");
  });

  it("geeft type, placeholder, autocomplete en aria-* door aan de input", () => {
    const wrapper = mount(UiInput, {
      attrs: {
        type: "email",
        placeholder: "jij@voorbeeld.nl",
        autocomplete: "email",
        "aria-describedby": "melding",
      },
    });
    const input = wrapper.get("input");
    expect(input.attributes("type")).toBe("email");
    expect(input.attributes("placeholder")).toBe("jij@voorbeeld.nl");
    expect(input.attributes("autocomplete")).toBe("email");
    expect(input.attributes("aria-describedby")).toBe("melding");
  });

  it("ondersteunt v-model.trim van de gebruiker", async () => {
    const Host = defineComponent({
      components: { UiInput },
      setup: () => ({ email: ref("") }),
      template: `<UiInput v-model.trim="email" />`,
    });
    const wrapper = mount(Host);
    await wrapper.get("input").setValue("  jij@voorbeeld.nl ");
    expect((wrapper.vm as unknown as { email: string }).email).toBe(
      "jij@voorbeeld.nl",
    );
  });

  it("zet de focus via de blootgestelde focus()", () => {
    const wrapper = mount(UiInput, { attachTo: document.body });
    (wrapper.vm as unknown as { focus: () => void }).focus();
    expect(document.activeElement).toBe(wrapper.get("input").element);
    wrapper.unmount();
  });

  it("toont de focus zichtbaar in elke variant met een rand", () => {
    const boxed = mount(UiInput).classes();
    expect(boxed).toContain("focus:border-accent");
    expect(boxed).toContain("focus:shadow-focus");

    const underline = mount(UiInput, {
      props: { variant: "underline" },
    }).classes();
    expect(underline).toContain("border-b");
    expect(underline).toContain("focus:border-accent");
  });
});
