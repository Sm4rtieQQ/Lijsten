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
import UiSpinner from "./ui/UiSpinner.vue";

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
    expect(wrapper.attributes("data-collapsed")).toBe("false");
    expect(wrapper.text()).toContain("Fout bij synchroniseren");
    expect(wrapper.findComponent(UiSpinner).exists()).toBe(false);
    expect(wrapper.find('[data-testid="sync-dot"]').exists()).toBe(true);
    expect(wrapper.attributes("data-status")).toBe("error");
  });

  it("klapt na 1,5 s stabiele foutstatus in tot alleen de dot", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountPill("error");
      expect(wrapper.attributes("data-collapsed")).toBe("false");

      vi.advanceTimersByTime(1499);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.attributes("data-collapsed")).toBe("false");

      vi.advanceTimersByTime(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.attributes("data-collapsed")).toBe("true");
      // Het label verdwijnt via CSS (`group-data-[collapsed=true]:`), niet via
      // een v-if; jsdom laadt geen stylesheet, dus het attribuut is de
      // component-norm die we hier vastleggen.
      expect(wrapper.find('[data-testid="sync-label"]').exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("klapt na 1,5 s ook de synced-status in (zelfde timer/logica)", async () => {
    vi.useFakeTimers();
    try {
      holder.refs!.lastSyncedAt.value = "2026-01-01T10:00:00.000Z";
      const wrapper = await mountPill("synced");
      expect(wrapper.text()).toContain("Gesynchroniseerd");

      vi.advanceTimersByTime(1500);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.attributes("data-collapsed")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("toont bij syncing alleen een spinner en is de pill uitgeschakeld", async () => {
    const wrapper = await mountPill("syncing");
    expect(wrapper.findComponent(UiSpinner).exists()).toBe(true);
    expect(wrapper.find('[data-testid="sync-dot"]').exists()).toBe(false);
    expect((wrapper.get("button").element as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(wrapper.attributes("data-collapsed")).toBe("false");
  });

  it("legt de actie 'Probeer opnieuw' in de aria-label bij een fout", async () => {
    const wrapper = await mountPill("error");
    expect(wrapper.get("button").attributes("aria-label")).toContain(
      "Probeer opnieuw",
    );
    expect(wrapper.get("button").attributes("aria-label")).toContain(
      "Fout bij synchroniseren",
    );
  });

  it("roept syncNow aan bij een klik op de pill", async () => {
    const wrapper = await mountPill("synced");
    await wrapper.get("button").trigger("click");
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("ingeklapt (alleen de dot) blijft de pill een klikbare knop", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountPill("synced");
      vi.advanceTimersByTime(1500);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.attributes("data-collapsed")).toBe("true");

      const pill = wrapper.get("button");
      expect((pill.element as HTMLButtonElement).disabled).toBe(false);
      await pill.trigger("click");
      expect(syncNow).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("toont bij pending 'In wachtrij' en klapt dan niet in", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountPill("pending");
      expect(wrapper.attributes("data-status")).toBe("pending");
      expect(wrapper.text()).toContain("In wachtrij");
      vi.advanceTimersByTime(5000);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.attributes("data-collapsed")).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("zet status en tijdstip in de tooltip", async () => {
    holder.refs!.queueLength.value = 0;
    const wrapper = await mountPill("synced");
    const title = wrapper.get("button").attributes("title");
    expect(title).toContain("Gesynchroniseerd");
    expect(title).toContain("laatste sync: nog niet gesynchroniseerd");
  });

  it("is tijdens het synchroniseren niet klikbaar", async () => {
    const wrapper = await mountPill("syncing");
    expect((wrapper.get("button").element as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
