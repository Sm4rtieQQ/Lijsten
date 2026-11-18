import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import ListCard from "./ListCard.vue";
import type { List } from "../types/app";

const list: List = {
  id: "l1",
  title: "Boodschappen",
  createdAt: "2026-01-01T00:00:00Z",
  items: [],
};

describe("ListCard (AGENTS.md §8.15)", () => {
  it("is een sleepdoel met een handvat, zonder sleeptoestand in rust", () => {
    const wrapper = mount(ListCard, { props: { list } });
    expect(wrapper.attributes("data-drag-id")).toBe("l1");
    expect(wrapper.attributes("data-dragging")).toBeUndefined();
    expect(wrapper.attributes("data-drop")).toBeUndefined();
    expect(wrapper.find("[data-drag-handle]").exists()).toBe(true);
  });

  it("markeert de placeholder en de kant waar de kaart landt", async () => {
    const wrapper = mount(ListCard, {
      props: { list, dragging: true, dropSide: "after" },
    });
    expect(wrapper.attributes("data-dragging")).toBeDefined();
    expect(wrapper.attributes("data-drop")).toBe("after");
    await wrapper.setProps({ dragging: false, dropSide: "before" });
    expect(wrapper.attributes("data-dragging")).toBeUndefined();
    expect(wrapper.attributes("data-drop")).toBe("before");
  });

  it("de zwevende kopie telt nooit als sleepdoel", () => {
    const wrapper = mount(ListCard, { props: { list, ghost: true } });
    expect(wrapper.attributes("data-drag-id")).toBeUndefined();
  });
});
