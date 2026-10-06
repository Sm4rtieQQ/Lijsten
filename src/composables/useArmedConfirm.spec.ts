import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { ARM_TIMEOUT_MS, useArmedConfirm } from "./useArmedConfirm";

describe("useArmedConfirm (twee-staps bevestiging, AGENTS.md §8.6)", () => {
  let onConfirm: Mock<(id: string) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    onConfirm = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("armt bij de eerste klik op een id", () => {
    const { armedId, isArmed, arm } = useArmedConfirm(onConfirm);
    arm("item:a");
    expect(armedId.value).toBe("item:a");
    expect(isArmed("item:a")).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("voert de actie pas uit bij de tweede klik op hetzelfde id", () => {
    const { armedId, isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    arm("item:a");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("item:a");
    expect(isArmed("item:a")).toBe(false);
    expect(armedId.value).toBeNull();
    dispose();
  });

  it("herstelt na ARM_TIMEOUT_MS zonder tweede klik", () => {
    const { armedId, isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    vi.advanceTimersByTime(ARM_TIMEOUT_MS - 1);
    expect(isArmed("item:a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isArmed("item:a")).toBe(false);
    expect(armedId.value).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    dispose();
  });

  it("houdt slechts één id tegelijk armed: een ander id herstelt de vorige", () => {
    const { isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    arm("item:b");
    expect(isArmed("item:a")).toBe(false);
    expect(isArmed("item:b")).toBe(true);
    // Tweede klik op het nieuwe id voert alleen díe actie uit.
    arm("item:b");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("item:b");
    dispose();
  });

  it("disarm() herstelt onmiddellijk zonder actie", () => {
    const { isArmed, arm, disarm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    disarm();
    expect(isArmed("item:a")).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    dispose();
  });

  it("herstelt na de bevestiging (armedId is weer null)", () => {
    const { armedId, arm, dispose } = useArmedConfirm(onConfirm);
    arm("clear");
    arm("clear");
    expect(armedId.value).toBeNull();
    dispose();
  });

  it("ESC maakt de knop ongewapend (zonder actie)", () => {
    const { isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isArmed("item:a")).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    dispose();
  });

  it("visibilitychange naar hidden herstelt de knop", () => {
    const { isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(isArmed("item:a")).toBe(false);
    dispose();
  });

  it("dispose() verwijdert de globale listeners", () => {
    const { isArmed, arm, dispose } = useArmedConfirm(onConfirm);
    arm("item:a");
    dispose();
    // Na dispose mogen geen listeners meer staan: ESC doet niets meer.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isArmed("item:a")).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
