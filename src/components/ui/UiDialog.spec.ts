import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";

import UiDialog from "./UiDialog.vue";
import { handleBack } from "../../composables/useBackNavigation";
import { stubDialog } from "./dialogStub";

function mountDialog(props: Record<string, unknown> = {}): VueWrapper {
  return mount(UiDialog, {
    attachTo: document.body,
    props: { open: true, ...props },
    slots: {
      eyebrow: "NIEUW LIJSTJE",
      title: "Hoe heet het lijstje?",
      default: '<input autofocus /><button type="submit">Ok</button>',
    },
  });
}

describe("UiDialog (native <dialog>, GitHub-issue #18)", () => {
  let wrapper: VueWrapper | undefined;
  let restore: () => void;

  beforeEach(() => {
    restore = stubDialog();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    restore();
  });

  it("opent modaal met aria-modal en de titel als label", async () => {
    wrapper = mountDialog();
    await nextTick();
    const dialog = wrapper.get("dialog");
    expect(dialog.attributes("open")).toBeDefined();
    expect(dialog.attributes("aria-modal")).toBe("true");
    const title = wrapper.get("h2");
    expect(title.text()).toBe("Hoe heet het lijstje?");
    expect(dialog.attributes("aria-labelledby")).toBe(title.attributes("id"));
    expect(wrapper.get("p").text()).toBe("NIEUW LIJSTJE");
  });

  it("zet de focus op het veld met autofocus (§8.3)", async () => {
    wrapper = mountDialog();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get("input").element);
  });

  it("opent en sluit met v-model:open", async () => {
    wrapper = mountDialog({ open: false });
    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();

    await wrapper.setProps({ open: true });
    await nextTick();
    expect(wrapper.get("dialog").attributes("open")).toBeDefined();

    await wrapper.setProps({ open: false });
    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toBeUndefined();
  });

  it("ESC sluit zonder actie (cancel)", async () => {
    wrapper = mountDialog();
    await nextTick();
    const event = new Event("cancel", { cancelable: true });
    wrapper.get("dialog").element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("volgt als de browser de dialoog zelf sluit", async () => {
    wrapper = mountDialog();
    await nextTick();
    wrapper.get("dialog").element.dispatchEvent(new Event("close"));
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("klik buiten (op de backdrop) sluit zonder actie", async () => {
    wrapper = mountDialog();
    await nextTick();
    const dialog = wrapper.get("dialog");
    await dialog.trigger("pointerdown");
    await dialog.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("klik binnen de dialoog of slepen naar buiten sluit niet", async () => {
    wrapper = mountDialog();
    await nextTick();
    await wrapper.get("input").trigger("click");
    // Tekst selecteren in het veld en loslaten boven de backdrop.
    await wrapper.get("input").trigger("pointerdown");
    await wrapper.get("dialog").trigger("click");
    expect(wrapper.emitted("cancel")).toBeUndefined();
  });

  it("toont alleen met closable een sluitknop, die zonder actie sluit", async () => {
    wrapper = mountDialog();
    expect(wrapper.find('button[aria-label="Sluiten"]').exists()).toBe(false);
    wrapper.unmount();

    wrapper = mountDialog({ closable: true });
    await nextTick();
    await wrapper.get('button[aria-label="Sluiten"]').trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("emit submit bij versturen van het formulier", async () => {
    wrapper = mountDialog();
    await nextTick();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toHaveLength(1);
  });

  it("Android-terugknop sluit de open dialoog, en alleen dan (§8.13)", async () => {
    wrapper = mountDialog({ open: false });
    expect(handleBack()).toBe(false);

    await wrapper.setProps({ open: true });
    await nextTick();
    expect(handleBack()).toBe(true);
    expect(wrapper.emitted("cancel")).toHaveLength(1);

    await wrapper.setProps({ open: false });
    expect(handleBack()).toBe(false);
  });

  it("meldt de terugknop af bij unmount", async () => {
    wrapper = mountDialog();
    await nextTick();
    wrapper.unmount();
    wrapper = undefined;
    expect(handleBack()).toBe(false);
  });

  it("zet de maat als data-attribuut", () => {
    wrapper = mountDialog({ size: "sm" });
    expect(wrapper.get("dialog").attributes("data-size")).toBe("sm");
  });
});
