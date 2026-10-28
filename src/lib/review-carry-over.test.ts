import { describe, expect, it } from "vitest";
import { carryOverReviews, normalizeOriginal, type ReviewedCorrection } from "./review-carry-over";

function old(overrides: Partial<ReviewedCorrection> = {}): ReviewedCorrection {
  return {
    original: "I goed",
    correction: "I went",
    category: "verb_tense",
    subtype: null,
    tense: null,
    tenseUsed: null,
    severity: "major",
    severityBeforeTypo: null,
    classifiedBy: null,
    discardedAt: null,
    discardReason: null,
    ...overrides,
  };
}

const fresh = (original: string, category = "verb_tense", severity = "major", correction = "I went") =>
  ({ original, correction, category, severity }) as never;

describe("normalizeOriginal", () => {
  it("ignores case, spacing and edge punctuation", () => {
    expect(normalizeOriginal("  I  Goed. ")).toBe("i goed");
    expect(normalizeOriginal('"i goed"')).toBe("i goed");
  });
});

describe("carryOverReviews", () => {
  const when = new Date(1000);

  it("carries a discard and its reason to the same fragment", () => {
    const [carried] = carryOverReviews([old({ discardedAt: when, discardReason: "It was right" })], [fresh("i  GOED")]);
    expect(carried).toEqual({ discardedAt: when, discardReason: "It was right" });
  });

  it("carries nothing for corrections without a review, or on other fragments", () => {
    expect(carryOverReviews([old()], [fresh("I goed")])).toEqual([{}]);
    expect(carryOverReviews([old({ discardedAt: when })], [fresh("she go")])).toEqual([{}]);
  });

  it("still matches when the model changes the category, preferring the same one", () => {
    const previous = [
      old({ category: "false_friends", discardedAt: when, discardReason: "a" }),
      old({ category: "verb_tense", discardedAt: when, discardReason: "b" }),
    ];
    const [one] = carryOverReviews(previous, [fresh("I goed", "verb_tense")]);
    expect(one.discardReason).toBe("b");
    const [other] = carryOverReviews([previous[0]], [fresh("I goed", "verb_tense")]);
    expect(other.discardReason).toBe("a");
  });

  it("does not carry a discard to a different fix of the same fragment", () => {
    const previous = old({ discardedAt: when, discardReason: "It was right" });
    expect(carryOverReviews([previous], [fresh("I goed", "verb_tense", "major", "I did go")])).toEqual([{}]);
    expect(carryOverReviews([previous], [fresh("I goed", "verb_tense", "major", " i WENT. ")])[0].discardedAt).toEqual(
      when,
    );
  });

  it("carries the manual type to a different fix, but not the discard", () => {
    const previous = old({ discardedAt: when, classifiedBy: "user", category: "false_friends", subtype: "x" });
    const [carried] = carryOverReviews([previous], [fresh("I goed", "verb_tense", "major", "I did go")]);
    expect(carried.discardedAt).toBeUndefined();
    expect(carried).toMatchObject({ category: "false_friends", classifiedBy: "user" });
  });

  it("uses each old correction once", () => {
    const result = carryOverReviews([old({ discardedAt: when })], [fresh("I goed"), fresh("I goed")]);
    expect(result[0].discardedAt).toEqual(when);
    expect(result[1]).toEqual({});
  });

  it("carries a manual typo mark and applies it to the new severity", () => {
    const previous = old({
      original: "freinds",
      category: "spelling",
      subtype: "keyboard_typo",
      severity: "typo",
      severityBeforeTypo: "minor",
      classifiedBy: "user",
    });
    const [carried] = carryOverReviews([previous], [fresh("freinds", "spelling", "major")]);
    expect(carried).toMatchObject({
      category: "spelling",
      subtype: "keyboard_typo",
      severity: "typo",
      severityBeforeTypo: "major",
      classification: "done",
      classifiedBy: "user",
    });
  });

  it("carries a manual type that is not a typo", () => {
    const previous = old({ category: "false_friends", subtype: "actually_actualmente", classifiedBy: "user" });
    const [carried] = carryOverReviews([previous], [fresh("I goed", "verb_tense", "typo")]);
    expect(carried).toMatchObject({ category: "false_friends", subtype: "actually_actualmente", severity: "minor" });
  });

  it("does not carry a type assigned by the classifier", () => {
    expect(carryOverReviews([old({ classifiedBy: "gemini:flash", subtype: "x" })], [fresh("I goed")])).toEqual([{}]);
  });
});
