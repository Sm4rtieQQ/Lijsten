/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Vitest vervangt CSS-imports door een lege string, dus de stijlbestanden
 * worden rechtstreeks van schijf gelezen, vanaf de projectroot (de werkmap
 * van Vitest).
 */
const read = (path: string): string => readFileSync(resolve(path), "utf8");

const tokensCss = read("src/styles/tokens.css");
const mainCss = read("src/styles/main.css");

/** Alle bron- en stijlbestanden (geen specs), om tokenverwijzingen te controleren. */
const sources = Object.fromEntries(
  readdirSync(resolve("src"), { recursive: true, encoding: "utf8" })
    .filter(
      (file) => /\.(vue|css|ts)$/.test(file) && !file.endsWith(".spec.ts"),
    )
    .map((file) => [file, read(`src/${file}`)]),
);

/** Waarde van een custom property, of `undefined`. */
function token(css: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim();
}

describe("main.css", () => {
  it("legt de laagvolgorde vast met legacy tussen base en components", () => {
    expect(mainCss).toContain(
      "@layer theme, base, legacy, components, utilities;",
    );
  });

  it("importeert Tailwind en de tokens", () => {
    expect(mainCss).toContain('@import "tailwindcss";');
    expect(mainCss).toContain('@import "./tokens.css";');
  });

  it("importeert de zelf gehoste fonts", () => {
    expect(mainCss).toContain('@import "./fonts.css";');
  });

  it("importeert de oude CSS in de laag legacy, nooit zonder laag", () => {
    expect(mainCss).toContain('@import "../styles.css" layer(legacy);');
    const unlayered = [...mainCss.matchAll(/@import\s+"([^"]+)"\s*;/g)]
      .map((match) => match[1])
      .filter(
        (path) =>
          path !== "tailwindcss" &&
          path !== "./tokens.css" &&
          path !== "./fonts.css",
      );
    expect(unlayered).toEqual([]);
  });

  it("heeft een globale :focus-visible-ring in de accentkleur", () => {
    expect(mainCss).toMatch(
      /:focus-visible\s*\{\s*outline: 2px solid var\(--color-accent\);/,
    );
  });
});

describe("tokens.css", () => {
  it("wist het standaardpalet van Tailwind", () => {
    expect(tokensCss).toContain("--color-*: initial;");
  });

  it.each([
    ["--color-paper", "#f7f1e8"],
    ["--color-surface", "#fffdfa"],
    ["--color-ink", "#342e2a"],
    ["--color-muted", "#938a80"],
    ["--color-line", "#e4d7c6"],
    ["--color-accent", "#e66d35"],
    ["--color-accent-dark", "#ce5925"],
    ["--color-accent-soft", "#f9dfd0"],
    ["--radius-card", "18px"],
    ["--radius-dialog", "20px"],
    ["--breakpoint-sm", "521px"],
  ])("%s is %s", (name, value) => {
    expect(token(tokensCss, name)).toBe(value);
  });

  it.each([
    ["--paper", "var(--color-paper)"],
    ["--ink", "var(--color-ink)"],
    ["--muted", "var(--color-muted)"],
    ["--line", "var(--color-line)"],
    ["--orange", "var(--color-accent)"],
    ["--orange-dark", "var(--color-accent-dark)"],
    ["--orange-soft", "var(--color-accent-soft)"],
    ["--white", "var(--color-surface)"],
  ])("oude naam %s verwijst naar %s", (name, value) => {
    expect(token(tokensCss, name)).toBe(value);
  });
});

describe("gebruikte CSS-variabelen", () => {
  /** Variabelen die Tailwind zelf definieert, of die de code per element zet. */
  const setElsewhere = new Set<string>(["--tw-"]);
  const defined = new Set(
    Object.values(sources).flatMap((text) =>
      [...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
    ),
  );

  it("verwijst alleen naar gedefinieerde variabelen", () => {
    const undefinedRefs = Object.entries(sources).flatMap(([file, text]) =>
      [...text.matchAll(/var\((--[a-z0-9-]+)/g)]
        .map((match) => match[1] ?? "")
        .filter(
          (name) =>
            !defined.has(name) &&
            ![...setElsewhere].some((prefix) => name.startsWith(prefix)),
        )
        .map((name) => `${file}: ${name}`),
    );
    expect(undefinedRefs).toEqual([]);
  });
});
