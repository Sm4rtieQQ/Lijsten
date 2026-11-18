/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  it("legt de laagvolgorde vast, zonder laag legacy", () => {
    expect(mainCss).toContain("@layer theme, base, components, utilities;");
    expect(mainCss).not.toContain("legacy");
  });

  it("importeert Tailwind en de tokens", () => {
    expect(mainCss).toContain('@import "tailwindcss";');
    expect(mainCss).toContain('@import "./tokens.css";');
  });

  it("importeert de zelf gehoste fonts", () => {
    expect(mainCss).toContain('@import "./fonts.css";');
  });

  it("importeert geen andere CSS dan Tailwind, fonts en tokens", () => {
    const imports = [...mainCss.matchAll(/@import\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(["tailwindcss", "./fonts.css", "./tokens.css"]);
  });

  it("de oude src/styles.css bestaat niet meer", () => {
    expect(existsSync(resolve("src/styles.css"))).toBe(false);
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

  it("definieert de keyframes van de animatietokens", () => {
    expect(tokensCss).toContain("--animate-fade: fade ");
    expect(tokensCss).toContain("@keyframes fade {");
    expect(tokensCss).toContain("--animate-spin-fast: spin ");
    expect(tokensCss).toContain("@keyframes spin {");
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
