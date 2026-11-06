import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addListener, minimizeApp } = vi.hoisted(() => ({
  addListener: vi.fn(),
  minimizeApp: vi.fn(() => Promise.resolve()),
}));
vi.mock("@capacitor/app", () => ({ App: { addListener, minimizeApp } }));

import {
  __resetBackNavigation,
  handleBack,
  initBackButton,
  onBackButton,
  registerBackHandler,
} from "./useBackNavigation";

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

beforeEach(() => {
  __resetBackNavigation();
  addListener.mockReset();
  addListener.mockResolvedValue({ remove: () => Promise.resolve() });
  minimizeApp.mockClear();
});
afterEach(() => {
  delete (globalThis as CapacitorGlobal).Capacitor;
});

describe("useBackNavigation — Android-terugknop (AGENTS.md §8.13)", () => {
  it("de nieuwste handler gaat voor; wie false teruggeeft geeft door", () => {
    const calls: string[] = [];
    registerBackHandler(() => (calls.push("scherm"), true));
    registerBackHandler(() => (calls.push("dialoog-dicht"), false));
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(["dialoog-dicht", "scherm"]);
  });

  it("afmelden haalt de handler weg; zonder handlers → false", () => {
    const off = registerBackHandler(() => true);
    off();
    expect(handleBack()).toBe(false);
  });

  it("handler → fallback → minimaliseren, in die volgorde", async () => {
    const minimize = vi.fn(() => Promise.resolve());
    const fallback = vi.fn(() => false);

    await onBackButton(fallback, minimize);
    expect(fallback).toHaveBeenCalledOnce();
    expect(minimize).toHaveBeenCalledOnce();

    fallback.mockReturnValue(true);
    await onBackButton(fallback, minimize);
    expect(minimize).toHaveBeenCalledOnce(); // fallback handelde het af

    const off = registerBackHandler(() => true);
    fallback.mockClear();
    await onBackButton(fallback, minimize);
    expect(fallback).not.toHaveBeenCalled();
    off();
  });

  it("een falende minimize reject niet", async () => {
    await expect(
      onBackButton(
        () => false,
        () => Promise.reject(new Error("geen plugin")),
      ),
    ).resolves.toBeUndefined();
  });

  it("koppelt de listener alleen native, en maar één keer", async () => {
    await initBackButton(() => false);
    expect(addListener).not.toHaveBeenCalled();

    (globalThis as CapacitorGlobal).Capacitor = {
      isNativePlatform: () => true,
    };
    await initBackButton(() => false);
    await initBackButton(() => false);
    expect(addListener).toHaveBeenCalledOnce();
    expect(addListener.mock.calls[0]?.[0]).toBe("backButton");

    // Een druk zonder handlers en zonder fallback → app naar het startscherm.
    const press = addListener.mock.calls[0]?.[1] as () => void;
    press();
    await Promise.resolve();
    expect(minimizeApp).toHaveBeenCalledOnce();
  });
});
