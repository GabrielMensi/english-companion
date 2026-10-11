import { describe, expect, it } from "vitest";
import { isTypoType, severityAfterManualType } from "@/lib/correction-review";

const TYPO = { category: "spelling", subtype: "keyboard_typo" } as const;

describe("isTypoType", () => {
  it("is only Spelling → Typo", () => {
    expect(isTypoType("spelling", "keyboard_typo")).toBe(true);
    expect(isTypoType("spelling", "other")).toBe(false);
    expect(isTypoType("vocabulary", "keyboard_typo")).toBe(false);
    expect(isTypoType("spelling", null)).toBe(false);
  });
});

describe("severityAfterManualType", () => {
  it("marks a mistake as a typo and remembers its severity", () => {
    const current = { severity: "moderate", severityBeforeTypo: null, category: "spelling", subtype: "other" } as const;
    expect(severityAfterManualType(current, TYPO)).toEqual({ severity: "typo", severityBeforeTypo: "moderate" });
  });

  it("keeps a typo the model caught as it is", () => {
    const current = { severity: "typo", severityBeforeTypo: null, category: "spelling", subtype: null } as const;
    expect(severityAfterManualType(current, TYPO)).toEqual({ severity: "typo", severityBeforeTypo: null });
  });

  it("keeps the stored severity when picking Typo again", () => {
    const current = { severity: "typo", severityBeforeTypo: "major", ...TYPO } as const;
    expect(severityAfterManualType(current, TYPO)).toEqual({ severity: "typo", severityBeforeTypo: "major" });
  });

  it("gives the stored severity back when moved away from Typo", () => {
    const current = { severity: "typo", severityBeforeTypo: "moderate", ...TYPO } as const;
    expect(severityAfterManualType(current, { category: "vocabulary", subtype: "other" })).toEqual({
      severity: "moderate",
      severityBeforeTypo: null,
    });
  });

  it("falls back to minor for a typo without a stored severity", () => {
    const current = { severity: "typo", severityBeforeTypo: null, ...TYPO } as const;
    expect(severityAfterManualType(current, { category: "spelling", subtype: "other" })).toEqual({
      severity: "minor",
      severityBeforeTypo: null,
    });
  });

  it("falls back to minor for a model-reported typo under another type, or unclassified", () => {
    for (const subtype of ["other", null]) {
      const current = { severity: "typo", severityBeforeTypo: null, category: "spelling", subtype } as const;
      expect(severityAfterManualType(current, { category: "vocabulary", subtype: "other" })).toEqual({
        severity: "minor",
        severityBeforeTypo: null,
      });
    }
  });

  it("leaves other changes alone", () => {
    const current = { severity: "major", severityBeforeTypo: null, category: "verb_tense", subtype: null } as const;
    expect(severityAfterManualType(current, { category: "verb_form", subtype: "other" })).toEqual({
      severity: "major",
      severityBeforeTypo: null,
    });
    const suggestion = {
      severity: "suggestion",
      severityBeforeTypo: null,
      category: "register_style",
      subtype: null,
    } as const;
    expect(severityAfterManualType(suggestion, { category: "vocabulary", subtype: "other" }).severity).toBe(
      "suggestion",
    );
  });
});
