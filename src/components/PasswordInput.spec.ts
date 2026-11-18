import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import PasswordInput from "./PasswordInput.vue";

function mountField() {
  return mount(PasswordInput, {
    props: { modelValue: "", toggleName: "wachtwoord" },
    attrs: { autocomplete: "current-password", "aria-label": "Wachtwoord" },
    attachTo: document.body,
  });
}

describe("PasswordInput", () => {
  it("zet de overige attributen op de input, niet op de wrapper", () => {
    const wrapper = mountField();
    const input = wrapper.get("input");
    expect(input.attributes("autocomplete")).toBe("current-password");
    expect(input.attributes("aria-label")).toBe("Wachtwoord");
    expect(input.attributes("minlength")).toBe("6");
    expect(wrapper.attributes("aria-label")).toBeUndefined();
    wrapper.unmount();
  });

  it("wisselt met het oogje tussen verborgen en zichtbaar", async () => {
    const wrapper = mountField();
    const toggle = wrapper.get("button");
    expect(toggle.attributes("type")).toBe("button");
    expect(wrapper.get("input").attributes("type")).toBe("password");
    expect(toggle.attributes("aria-label")).toBe("Toon wachtwoord");

    await toggle.trigger("click");
    expect(wrapper.get("input").attributes("type")).toBe("text");
    expect(toggle.attributes("aria-label")).toBe("Wachtwoord verbergen");

    await toggle.trigger("click");
    expect(wrapper.get("input").attributes("type")).toBe("password");
    wrapper.unmount();
  });

  it("zet de focus op de input via de blootgestelde focus()", () => {
    const wrapper = mountField();
    (wrapper.vm as unknown as { focus: () => void }).focus();
    expect(document.activeElement).toBe(wrapper.get("input").element);
    wrapper.unmount();
  });
});
