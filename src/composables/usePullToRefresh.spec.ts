import { describe, expect, it, vi } from "vitest";

import {
  PULL_MAX,
  PULL_RESISTANCE,
  PULL_THRESHOLD,
  usePullToRefresh,
} from "./usePullToRefresh";

/** Vingerafstand die na weerstand precies `px` indicator-afstand oplevert. */
const finger = (px: number): number => px / PULL_RESISTANCE;

describe("usePullToRefresh (AGENTS.md §8.14)", () => {
  it("voorbij de drempel loslaten → één sync, daarna terug naar 0", async () => {
    let finish: () => void = () => {};
    const onRefresh = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const p = usePullToRefresh(onRefresh);

    p.start(100, true, false);
    expect(p.move(100 + finger(PULL_THRESHOLD), true)).toBe(true);
    expect(p.progress.value).toBe(1);

    const done = p.end();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(p.refreshing.value).toBe(true);
    expect(p.distance.value).toBe(PULL_THRESHOLD);

    // Tijdens de sync start een nieuwe pull niet.
    p.start(100, true, false);
    expect(p.move(400, true)).toBe(false);

    finish();
    await done;
    expect(p.refreshing.value).toBe(false);
    expect(p.distance.value).toBe(0);
  });

  it("onder de drempel loslaten → geen sync, terugveren", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const p = usePullToRefresh(onRefresh);
    p.start(0, true, false);
    p.move(finger(PULL_THRESHOLD - 1), true);
    await p.end();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(p.distance.value).toBe(0);
  });

  it("start niet als de pagina niet bovenaan staat of het doel geblokkeerd is", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const p = usePullToRefresh(onRefresh);

    p.start(0, false, false); // er is gescrold
    expect(p.move(500, true)).toBe(false);
    await p.end();

    p.start(0, true, true); // sleephandvat, invoerveld of dialoog
    expect(p.move(500, true)).toBe(false);
    await p.end();

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("omhoog bewegen is gewoon scrollen; de afstand is begrensd", () => {
    const p = usePullToRefresh(() => Promise.resolve());
    p.start(200, true, false);
    expect(p.move(150, true)).toBe(false);
    expect(p.distance.value).toBe(0);
    p.move(200 + 10_000, true);
    expect(p.distance.value).toBe(PULL_MAX);
  });

  it("cancel en wegscrollen breken de pull af zonder sync", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const p = usePullToRefresh(onRefresh);
    p.start(0, true, false);
    p.move(finger(PULL_MAX), true);
    p.cancel();
    expect(p.distance.value).toBe(0);
    await p.end();

    p.start(0, true, false);
    p.move(finger(PULL_MAX), true);
    expect(p.move(finger(PULL_MAX) + 5, false)).toBe(false);
    await p.end();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
