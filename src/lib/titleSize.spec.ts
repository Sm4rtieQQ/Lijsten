import { describe, expect, it } from "vitest";

import { MAX_TITLE_LENGTH, titleSize } from "./titleSize";

describe("titleSize — lettergrootte per titellengte (#47)", () => {
  it("de maximale lengte is 24 tekens", () => {
    expect(MAX_TITLE_LENGTH).toBe(24);
  });

  it("tot en met 16 tekens: normaal", () => {
    expect(titleSize("")).toBe("lg");
    expect(titleSize("Klussen")).toBe("lg");
    expect(titleSize("a".repeat(16))).toBe("lg");
  });

  it("17 tot en met 20 tekens: middel", () => {
    expect(titleSize("a".repeat(17))).toBe("md");
    expect(titleSize("a".repeat(20))).toBe("md");
  });

  it("21 tot en met 24 tekens: klein", () => {
    expect(titleSize("a".repeat(21))).toBe("sm");
    expect(titleSize("Boodschappen weekend AH")).toBe("sm");
    expect(titleSize("W".repeat(24))).toBe("sm");
  });

  it("oude titels langer dan 24 tekens blijven klein", () => {
    expect(titleSize("x".repeat(60))).toBe("sm");
  });

  it("telt na trim() en een emoji als één teken", () => {
    expect(titleSize(`  ${"a".repeat(16)}  `)).toBe("lg");
    expect(titleSize("🛒".repeat(16))).toBe("lg");
    expect(titleSize("🛒".repeat(17))).toBe("md");
  });
});
