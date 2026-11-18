import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import ItemRow from "./ItemRow.vue";
import UiCheck from "./ui/UiCheck.vue";
import { createListItem, type ListItem } from "../types/app";

function item(done = false): ListItem {
  return createListItem({ listId: "l1", text: "Melk", done });
}

describe("ItemRow", () => {
  it("zet data-done en het vinkje volgens het item (§8.5)", async () => {
    const wrapper = mount(ItemRow, { props: { item: item(false) } });
    const check = () => wrapper.findComponent(UiCheck);
    expect(wrapper.attributes("data-done")).toBeUndefined();
    expect(check().attributes("data-checked")).toBeUndefined();

    await wrapper.setProps({ item: item(true) });
    expect(wrapper.attributes("data-done")).toBeDefined();
    expect(check().attributes("data-checked")).toBeDefined();
    expect(check().attributes("aria-label")).toBe("Afvinken ongedaan maken");
  });

  it("meldt toggle via het vinkje en via de tekst", async () => {
    const wrapper = mount(ItemRow, { props: { item: item() } });
    await wrapper.get('button[aria-label="Item afvinken"]').trigger("click");
    await wrapper.get("span").trigger("click");
    expect(wrapper.emitted("toggle")).toHaveLength(2);
  });

  it("zet de sleeptoestand in data-dragging en data-drop (§8.15)", async () => {
    const wrapper = mount(ItemRow, { props: { item: item() } });
    expect(wrapper.attributes("data-dragging")).toBeUndefined();
    expect(wrapper.attributes("data-drop")).toBeUndefined();

    await wrapper.setProps({ dragging: true, dropSide: "after" });
    expect(wrapper.attributes("data-dragging")).toBeDefined();
    expect(wrapper.attributes("data-drop")).toBe("after");

    await wrapper.setProps({ dragging: false, dropSide: "before" });
    expect(wrapper.attributes("data-dragging")).toBeUndefined();
    expect(wrapper.attributes("data-drop")).toBe("before");
  });

  it("markeert het handvat met data-drag-handle (pull-guard, §8.14)", () => {
    const wrapper = mount(ItemRow, { props: { item: item() } });
    const handle = wrapper.get("[data-drag-handle]");
    expect(handle.attributes("aria-label")).toBe(
      "Sleep item om te verplaatsen",
    );
  });

  it("de zwevende kopie heeft geen data-drag-id", () => {
    const row = mount(ItemRow, { props: { item: item() } });
    expect(row.attributes("data-drag-id")).toBeDefined();
    const ghost = mount(ItemRow, { props: { item: item(), ghost: true } });
    expect(ghost.attributes("data-drag-id")).toBeUndefined();
  });
});
