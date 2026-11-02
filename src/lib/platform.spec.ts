import { afterEach, describe, expect, it } from "vitest";

import {
  APP_SCHEME,
  emailRedirectTo,
  isNativePlatform,
  webRedirectTarget,
} from "./platform";

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

afterEach(() => {
  delete (globalThis as CapacitorGlobal).Capacitor;
});

describe("webRedirectTarget — web-redirect incl. subpad (AGENTS.md §8.12/§10.3)", () => {
  it("neemt het pad mee, zodat een projectpagina onder /Lijsten/ werkt", () => {
    expect(
      webRedirectTarget({
        origin: "https://sm4rtieqq.github.io",
        pathname: "/Lijsten/",
      }),
    ).toBe("https://sm4rtieqq.github.io/Lijsten/");
  });

  it("werkt ook op de root (dev-server)", () => {
    expect(
      webRedirectTarget({ origin: "http://localhost:5173", pathname: "/" }),
    ).toBe("http://localhost:5173/");
  });

  it("geeft null zonder origin (geen location)", () => {
    expect(webRedirectTarget(undefined)).toBeNull();
    expect(webRedirectTarget({})).toBeNull();
  });
});

describe("isNativePlatform / emailRedirectTo", () => {
  it("in de browser: niet native, redirect naar de pagina-URL", () => {
    expect(isNativePlatform()).toBe(false);
    expect(emailRedirectTo()).toBe(
      `${window.location.origin}${window.location.pathname}`,
    );
  });

  it("in Capacitor: native, redirect naar het eigen scheme", () => {
    (globalThis as CapacitorGlobal).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(isNativePlatform()).toBe(true);
    expect(emailRedirectTo()).toBe(`${APP_SCHEME}://`);
  });
});
