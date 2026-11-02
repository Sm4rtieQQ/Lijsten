import { describe, expect, it } from "vitest";

import { createId, isExactTitleMatch, moveId } from "./utils";

describe("moveId — drag & drop volgorde", () => {
  const ids = ["a", "b", "c", "d"];

  it("verplaatst naar beneden en naar boven", () => {
    expect(moveId(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveId(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("geeft null bij hetzelfde of een onbekend id, en muteert niet", () => {
    expect(moveId(ids, "a", "a")).toBeNull();
    expect(moveId(ids, "x", "a")).toBeNull();
    expect(moveId(ids, "a", "x")).toBeNull();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});

describe("isExactTitleMatch (§8.3)", () => {
  it("exact en hoofdlettergevoelig na trim", () => {
    expect(isExactTitleMatch("  Boodschappen ", "Boodschappen")).toBe(true);
    expect(isExactTitleMatch("boodschappen", "Boodschappen")).toBe(false);
  });
});

describe("createId", () => {
  it("geeft unieke ids", () => {
    expect(createId()).not.toBe(createId());
  });
});
