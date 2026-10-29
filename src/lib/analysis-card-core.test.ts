import { describe, expect, it } from "vitest";

import { type CardCorrection, cardSections, reviewFeedback } from "@/lib/analysis-card-core";

function c(id: string, partial: Partial<CardCorrection> = {}): CardCorrection {
  return { id, original: id, correction: id, severity: "minor", category: "other", discardedAt: null, ...partial };
}

const FROM = "I goed to teh park yesterday";
const TO = "I went to the park yesterday";
const went = c("went", { original: "goed", correction: "went", severity: "moderate", category: "verb_form" });
const the = c("the", { original: "teh", correction: "the", category: "spelling" });

describe("cardSections", () => {
  it("splits corrections by severity and counts them", () => {
    const s = cardSections(FROM, TO, [went, the, c("s", { severity: "suggestion" })]);
    expect(s.mistakes.map((m) => m.id)).toEqual(["went", "the"]);
    expect(s.suggestions.map((m) => m.id)).toEqual(["s"]);
    expect(s.counts).toMatchObject({ moderate: 1, minor: 1, typo: 0 });
    expect(s.headline).toBeNull();
    expect(s.extrasSummary).toBe("1 suggestion");
  });

  it("moves a mistake marked as a typo and keeps its number", () => {
    const before = cardSections(FROM, TO, [went, the]);
    const after = cardSections(FROM, TO, [went, { ...the, severity: "typo" }]);
    expect(after.mistakes.map((m) => m.id)).toEqual(["went"]);
    expect(after.typos.map((m) => m.id)).toEqual(["the"]);
    expect(after.counts).toMatchObject({ moderate: 1, minor: 0, typo: 1 });
    expect(after.extrasSummary).toBe("1 typo");
    expect(after.marked.numbers).toEqual(before.marked.numbers);
    expect(after.marked.numbers.get("the")).toBe(2);
  });

  it("says when the only mistakes were typos", () => {
    const s = cardSections(FROM, TO, [
      { ...went, severity: "typo" },
      { ...the, severity: "typo" },
    ]);
    expect(s.headline).toBe("No mistakes, just 2 typos.");
    expect(s.extrasSummary).toBe("2 typos");
    expect(cardSections(FROM, TO, [{ ...the, severity: "typo" }]).headline).toBe("No mistakes, just a typo.");
  });

  it("puts discarded corrections apart, out of every count, still numbered", () => {
    const s = cardSections(FROM, TO, [{ ...went, discardedAt: 1 }, the]);
    expect(s.mistakes.map((m) => m.id)).toEqual(["the"]);
    expect(s.discarded.map((m) => m.id)).toEqual(["went"]);
    expect(s.counts).toMatchObject({ moderate: 0, minor: 1 });
    expect(s.marked.numbers.get("went")).toBe(1);

    const all = cardSections(FROM, TO, [
      { ...went, discardedAt: 1 },
      { ...the, discardedAt: 1 },
    ]);
    expect(all.headline).toBe("No mistakes.");
    expect(all.extrasSummary).toBeNull();
    expect(cardSections("Fine.", "Fine.", []).headline).toBe("Perfect! No mistakes.");
  });
});

describe("reviewFeedback", () => {
  const minor = { severity: "minor", discardedAt: null } as const;
  const typo = { severity: "typo", discardedAt: null } as const;

  it("explains a typo set by hand, following the setting", () => {
    expect(reviewFeedback(minor, typo, false)).toBe("Marked as a typo: it won’t count in your stats");
    expect(reviewFeedback(minor, typo, true)).toBe(
      "Marked as a typo: it still counts, because typos are on in Settings",
    );
    expect(reviewFeedback(typo, minor, true)).toBe("No longer a typo: it counts in your stats");
  });

  it("explains discarding and restoring", () => {
    expect(reviewFeedback(minor, { ...minor, discardedAt: 1 }, false)).toBe("Discarded: it won’t count in your stats");
    expect(reviewFeedback({ ...minor, discardedAt: 1 }, minor, true)).toBe("Restored: it counts in your stats again");
  });

  it("stays quiet when nothing about the stats changed", () => {
    expect(reviewFeedback(minor, { ...minor, severity: "major" }, true)).toBeNull();
    expect(reviewFeedback(typo, typo, false)).toBeNull();
  });
});
