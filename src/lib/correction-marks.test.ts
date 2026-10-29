import { describe, expect, it } from "vitest";

import { groupMistakes, type MarkableCorrection, markDiff } from "@/lib/correction-marks";
import type { Severity } from "@/lib/taxonomy";

function correction(
  id: string,
  original: string,
  fixed: string,
  severity: Severity = "minor",
  category = "spelling",
): MarkableCorrection {
  return { id, original, correction: fixed, severity, category };
}

function rendered(from: string, to: string, corrections: MarkableCorrection[]) {
  return markDiff(from, to, corrections)
    .segments.map((s) => {
      const text =
        s.kind === "added"
          ? `+[${s.value}]`
          : s.kind === "removed"
            ? `-[${s.value}]`
            : s.kind === "flagged"
              ? `?[${s.value}]`
              : s.value;
      return s.notes.length ? `${text}^${s.notes.join(",")}` : text;
    })
    .join("");
}

describe("markDiff", () => {
  it("puts a reference number after each change, numbered left to right", () => {
    const from = "It is very diferent and I want make it easly.";
    const to = "It is very different and I want to make it easily.";
    const result = markDiff(from, to, [
      correction("b", "easly", "easily"),
      correction("a", "diferent", "different"),
      correction("c", "want make", "want to make", "moderate", "verb_patterns"),
    ]);
    expect(result.numbers).toEqual(
      new Map([
        ["a", 1],
        ["c", 2],
        ["b", 3],
      ]),
    );
    expect(
      rendered(from, to, [
        correction("b", "easly", "easily"),
        correction("a", "diferent", "different"),
        correction("c", "want make", "want to make"),
      ]),
    ).toBe("It is very -[diferent]+[different]^1 and I want +[to ]^2make it -[easly]+[easily]^3.");
  });

  it("anchors a correction whose original includes context around the change", () => {
    const from = "I need a implementation plan.";
    const to = "I need an implementation plan.";
    expect(rendered(from, to, [correction("a", "a implementation", "an implementation", "minor", "articles")])).toBe(
      "I need -[a]+[an]^1 implementation plan.",
    );
  });

  it("matches repeated words to separate changes", () => {
    const from = "Is diferent, very diferent.";
    const to = "Is different, very different.";
    const result = markDiff(from, to, [
      correction("a", "diferent", "different"),
      correction("b", "diferent", "different"),
    ]);
    expect(result.numbers).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
  });

  it("falls back to the corrected text and ignores corrections it can't find", () => {
    const from = "She go home.";
    const to = "She goes home.";
    const result = markDiff(from, to, [
      correction("x", "something else", "nowhere"),
      correction("a", "", "goes", "moderate", "verb_forms"),
    ]);
    expect(result.numbers).toEqual(new Map([["a", 1]]));
  });

  it("flags mistakes the corrected text forgot to fix, in text order", () => {
    const from = "Work on develop. I agree with your propousal, and the button used on the section neither.";
    const to = "Work on develop. I agree with your proposal, and the button used on the section neither.";
    const corrections = [
      correction("a", "develop", "development"),
      correction("b", "propousal", "proposal"),
      correction("c", "on the section", "in the section"),
      correction("d", "neither", "either"),
    ];
    expect(rendered(from, to, corrections)).toBe(
      "Work on ?[develop]^1. I agree with your -[propousal]+[proposal]^2, and the button used ?[on the section]^3 ?[neither]^4.",
    );
    expect(markDiff(from, to, corrections).numbers.get("d")).toBe(4);
  });

  it("only flags whole words", () => {
    expect(rendered("It is inside.", "It is inside.", [correction("a", "in", "on")])).toBe("It is inside.");
  });

  it("returns the plain text when nothing changed", () => {
    const result = markDiff("All good.", "All good.", []);
    expect(result.segments).toEqual([{ kind: "same", value: "All good.", notes: [] }]);
    expect(result.numbers.size).toBe(0);
  });
});

describe("groupMistakes", () => {
  it("orders groups by their worst mistake, then size, and items by severity", () => {
    const groups = groupMistakes([
      correction("1", "a", "b", "minor", "spelling"),
      correction("2", "a", "b", "moderate", "phrasal_verbs"),
      correction("3", "a", "b", "minor", "spelling"),
      correction("4", "a", "b", "minor", "articles"),
      correction("5", "a", "b", "major", "spelling"),
    ]);
    expect(groups.map((g) => [g.category, g.top, g.items.map((i) => i.id)])).toEqual([
      ["spelling", "major", ["5", "1", "3"]],
      ["phrasal_verbs", "moderate", ["2"]],
      ["articles", "minor", ["4"]],
    ]);
  });
});
