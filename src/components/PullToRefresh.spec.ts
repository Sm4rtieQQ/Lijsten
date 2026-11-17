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
  const indicator = () => wrapper!.get('[data-testid="pull-indicator"]');

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
    expect(indicator().attributes("data-state")).toBe("ready");

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

  it("onder de drempel loslaten → terugveren zonder sync; vanaf 64 px is hij klaar", async () => {
    wrapper = mount(PullToRefresh);
    expect(indicator().attributes("data-state")).toBe("idle");

    // De indicator beweegt half zo snel als de vinger: 126 px → 63 px.
    touch("touchstart", 0, document.body);
    touch("touchmove", 126, document.body);
    await wrapper.vm.$nextTick();
    expect(indicator().attributes("data-state")).toBe("pulling");
    // 128 px → precies de drempel (64 px).
    touch("touchmove", 128, document.body);
    await wrapper.vm.$nextTick();
    expect(indicator().attributes("data-state")).toBe("ready");
    touch("touchmove", 126, document.body);
    await wrapper.vm.$nextTick();
    expect(indicator().attributes("data-state")).toBe("pulling");

    touch("touchend", null, document.body);
    await flushPromises();
    expect(syncNow).not.toHaveBeenCalled();
    expect(indicator().attributes("data-state")).toBe("idle");
  });

  it("toont refreshing tot de sync klaar is, en start dan niet opnieuw", async () => {
    let finish: () => void = () => {};
    syncNow.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    wrapper = mount(PullToRefresh);
    touch("touchstart", 0, document.body);
    touch("touchmove", 300, document.body);
    touch("touchend", null, document.body);
    await wrapper.vm.$nextTick();
    expect(indicator().attributes("data-state")).toBe("refreshing");

    // Tijdens een lopende sync begint er geen nieuwe pull.
    touch("touchstart", 0, document.body);
    const move = touch("touchmove", 300, document.body);
    expect(move.defaultPrevented).toBe(false);

    finish();
    await flushPromises();
    expect(indicator().attributes("data-state")).toBe("idle");
    expect(syncNow).toHaveBeenCalledOnce();
  });

  // De component herkent deze plekken aan hun CSS-klassen (BLOCKED in
  // PullToRefresh.vue). Een hernoeming zonder deze selector mee te nemen
  // laat de pull weer starten vanaf een handvat (§8.14).
  it.each([
    ["een invoerveld", "<input />"],
    ["een tekstvak", "<textarea></textarea>"],
    ["een keuzelijst", "<select></select>"],
    ["een dialoog", "<dialog><p>tekst</p></dialog>"],
    [
      "het sleephandvat van een item",
      '<button class="drag-handle"><span></span></button>',
    ],
    [
      "het sleephandvat van een lijst",
      '<button class="list-drag-handle"><span></span></button>',
    ],
  ])("niet vanaf %s", async (_name, html) => {
    wrapper = mount(PullToRefresh);
    document.body.insertAdjacentHTML("beforeend", html);
    const root = document.body.lastElementChild!;
    // Het diepste kind: het gebaar begint op een element ín het blokgebied.
    const target = root.firstElementChild ?? root;
    touch("touchstart", 10, target);
    const move = touch("touchmove", 300, target);
    touch("touchend", null, target);
    await flushPromises();
    expect(move.defaultPrevented).toBe(false);
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
