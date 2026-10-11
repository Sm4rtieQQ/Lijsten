import { describe, expect, it } from "vitest";

import { shouldRegisterServiceWorker } from "./register-sw";

describe("shouldRegisterServiceWorker", () => {
  const base = { hasServiceWorker: true, isDev: false, isNative: false };

  it("registreert in productie op het web", () => {
    expect(shouldRegisterServiceWorker(base)).toBe(true);
  });

  it("registreert niet zonder serviceWorker-API", () => {
    expect(
      shouldRegisterServiceWorker({ ...base, hasServiceWorker: false }),
    ).toBe(false);
  });

  it("registreert niet in development", () => {
    expect(shouldRegisterServiceWorker({ ...base, isDev: true })).toBe(false);
  });

  it("registreert niet in de Capacitor-app", () => {
    expect(shouldRegisterServiceWorker({ ...base, isNative: true })).toBe(
      false,
    );
  });
});
