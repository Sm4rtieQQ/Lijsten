import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import type { SyncStatus } from "../composables/useSync";

/**
 * De mock refs worden in de fabriek gemaakt (echte Vue-refs, zodat `watch`
 * in de component werkt) en via de hoisted holder aan de tests blootgesteld.
 */
const { syncNow } = vi.hoisted(() => ({ syncNow: vi.fn() }));

const holder = vi.hoisted(() => ({
  refs: null as null | {
    status: { value: SyncStatus };
    lastSyncedAt: { value: string | null };
    queueLength: { value: number };
  },
}));

vi.mock("../composables/useSync", async () => {
  const { ref } = await import("vue");
  const status = ref<SyncStatus>("synced");
  const lastSyncedAt = ref<string | null>(null);
  const queueLength = ref<number>(0);
  holder.refs = { status, lastSyncedAt, queueLength };
  return {
    useSync: () => ({ status, lastSyncedAt, queueLength, syncNow }),
  };
});

import SyncIndicator from "./SyncIndicator.vue";

async function mountPill(
  status: SyncStatus,
): Promise<ReturnType<typeof mount>> {
  holder.refs!.status.value = status;
  holder.refs!.lastSyncedAt.value = null;
  holder.refs!.queueLength.value = 0;
  syncNow.mockClear();
  const wrapper = mount(SyncIndicator);
  await flushPromises();
  return wrapper;
}

describe("SyncIndicator (AGENTS.md §7.4)", () => {
  it("toont bij error het NL-label, de rode dot en geen spinner", async () => {
    const wrapper = await mountPill("error");
    const row = wrapper.get(".sync-row");
    expect(wrapper.get(".sync-pill").classes()).not.toContain("is-collapsed");
    expect(row.text()).toContain("Fout bij synchroniseren");
    expect(wrapper.find(".sync-spinner").exists()).toBe(false);
    expect(wrapper.find(".sync-dot").exists()).toBe(true);
    expect(wrapper.attributes("data-status")).toBe("error");
  });

  it("klapt na 1,5 s stabiele foutstatus in tot alleen de dot", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountPill("error");
      expect(wrapper.get(".sync-row").classes()).not.toContain("is-collapsed");

      vi.advanceTimersByTime(1499);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.get(".sync-row").classes()).not.toContain("is-collapsed");

      vi.advanceTimersByTime(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.get(".sync-row").classes()).toContain("is-collapsed");
      // Het label verdwijnt via CSS (`.is-collapsed .sync-label`), niet via
      // een v-if; jsdom kan de stylesheet niet laden, dus de class is de
      // component-norm die we hier vastleggen.
      expect(wrapper.find(".sync-label").exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("klapt na 1,5 s ook de synced-status in (zelfde timer/logica)", async () => {
    vi.useFakeTimers();
    try {
      holder.refs!.lastSyncedAt.value = "2026-01-01T10:00:00.000Z";
      const wrapper = await mountPill("synced");
      expect(wrapper.get(".sync-row").text()).toContain("Gesynchroniseerd");

      vi.advanceTimersByTime(1500);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.get(".sync-row").classes()).toContain("is-collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("toont bij syncing alleen een spinner en is de pill uitgeschakeld", async () => {
    const wrapper = await mountPill("syncing");
    expect(wrapper.find(".sync-spinner").exists()).toBe(true);
    expect(wrapper.find(".sync-dot").exists()).toBe(false);
    expect(
      (wrapper.get(".sync-pill").element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(wrapper.get(".sync-row").classes()).not.toContain("is-collapsed");
  });

  it("legt de actie 'Probeer opnieuw' in de aria-label bij een fout", async () => {
    const wrapper = await mountPill("error");
    expect(wrapper.get(".sync-pill").attributes("aria-label")).toContain(
      "Probeer opnieuw",
    );
    expect(wrapper.get(".sync-pill").attributes("aria-label")).toContain(
      "Fout bij synchroniseren",
    );
  });

  it("roept syncNow aan bij een klik op de pill", async () => {
    const wrapper = await mountPill("synced");
    await wrapper.get(".sync-pill").trigger("click");
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
