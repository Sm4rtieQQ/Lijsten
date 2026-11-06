import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";

const { syncNow } = vi.hoisted(() => ({
  syncNow: vi.fn(() => Promise.resolve()),
}));
vi.mock("../composables/useSync", () => ({ useSync: () => ({ syncNow }) }));

import PullToRefresh from "./PullToRefresh.vue";

/**
 * jsdom kan geen echte `Touch`-objecten maken; een event met een `touches`-
 * lijst is genoeg voor de component (die alleen `clientY` leest).
 */
function touch(type: string, y: number | null, target: EventTarget): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: y === null ? [] : [{ clientY: y }],
  });
  target.dispatchEvent(event);
  return event;
}

function setScrollY(value: number): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value });
}

describe("PullToRefresh (AGENTS.md §8.14)", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    syncNow.mockClear();
    setScrollY(0);
  });
  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("bovenaan omlaag swipen en loslaten → sync; de browser scrollt niet zelf", async () => {
    wrapper = mount(PullToRefresh);
    touch("touchstart", 10, document.body);
    const move = touch("touchmove", 300, document.body);
    expect(move.defaultPrevented).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".pull-indicator").classes()).toContain("is-ready");

    touch("touchend", null, document.body);
    await flushPromises();
    expect(syncNow).toHaveBeenCalledOnce();
  });

  it("niet als de pagina gescrold is", async () => {
    wrapper = mount(PullToRefresh);
    setScrollY(40);
    touch("touchstart", 10, document.body);
    const move = touch("touchmove", 300, document.body);
    touch("touchend", null, document.body);
    await flushPromises();
    expect(move.defaultPrevented).toBe(false);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("niet vanaf een invoerveld of sleephandvat", async () => {
    wrapper = mount(PullToRefresh);
    for (const html of [
      "<input />",
      '<button class="drag-handle"><span></span></button>',
    ]) {
      document.body.insertAdjacentHTML("beforeend", html);
      const target =
        document.body.lastElementChild?.firstElementChild ??
        document.body.lastElementChild!;
      touch("touchstart", 10, target);
      touch("touchmove", 300, target);
      touch("touchend", null, target);
    }
    await flushPromises();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("ruimt de listeners op bij unmount", async () => {
    wrapper = mount(PullToRefresh);
    wrapper.unmount();
    wrapper = undefined;
    touch("touchstart", 10, document.body);
    touch("touchmove", 300, document.body);
    touch("touchend", null, document.body);
    await flushPromises();
    expect(syncNow).not.toHaveBeenCalled();
  });
});
