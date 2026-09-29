import { describe, expect, it } from "vitest";
import {
  buildClassificationPrompt,
  type ClassificationItem,
  normalizeClassification,
  ruleClassification,
  sentenceAround,
} from "./classify-core";

function item(partial: Partial<ClassificationItem>): ClassificationItem {
  return {
    id: "c1",
    category: "verb_tense",
    severity: "moderate",
    original: "I live",
    correction: "I have lived",
    explanation: "...",
    message: "I live here since 2020.",
    ...partial,
  };
}

describe("ruleClassification", () => {
  it("skips suggestions", () => {
    expect(ruleClassification(item({ severity: "suggestion" }))?.status).toBe("skipped");
  });

  it("classifies typos without a model", () => {
    expect(ruleClassification(item({ severity: "typo", category: "spelling" }))).toEqual({
      status: "done",
      subtype: "keyboard_typo",
      tense: null,
      tenseUsed: null,
    });
  });

  it("uses the only type of single-type categories", () => {
    expect(ruleClassification(item({ category: "false_friends" }))?.subtype).toBe("false_cognate");
  });

  it("leaves everything else to the model", () => {
    expect(ruleClassification(item({}))).toBeNull();
    expect(ruleClassification(item({ category: "spelling", severity: "minor" }))).toBeNull();
  });
});

describe("normalizeClassification", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", category: "verb_form", original: "have wrote", correction: "have written" }),
    item({ id: "c", category: "prepositions", original: "depends of", correction: "depends on" }),
  ];

  it("keeps valid answers and records the tense confusion", () => {
    const result = normalizeClassification(items, {
      items: [{ index: 1, subtype: "tense_choice", tense: "present_perfect", tenseUsed: "present_simple" }],
    });
    expect(result.get("a")).toEqual({
      status: "done",
      subtype: "tense_choice",
      tense: "present_perfect",
      tenseUsed: "present_simple",
    });
  });

  it("drops tenseUsed when it's the same tense (a form mistake)", () => {
    const result = normalizeClassification(items, {
      items: [{ index: 2, subtype: "past_participle", tense: "present_perfect", tenseUsed: "present_perfect" }],
    });
    expect(result.get("b")).toMatchObject({ tense: "present_perfect", tenseUsed: null });
  });

  it("ignores tenses on non-verb categories and 'none'", () => {
    const result = normalizeClassification(items, {
      items: [
        { index: 1, subtype: "tense_choice", tense: "none", tenseUsed: "past_simple" },
        { index: 3, subtype: "dependent_preposition", tense: "present_simple", tenseUsed: "none" },
      ],
    });
    expect(result.get("a")).toMatchObject({ tense: null, tenseUsed: null });
    expect(result.get("c")).toMatchObject({ subtype: "dependent_preposition", tense: null });
  });

  it("maps unknown or other-category subtypes to other, and accepts loose spelling", () => {
    const result = normalizeClassification(items, {
      items: [
        { index: 1, subtype: "dependent_preposition", tense: "none", tenseUsed: "none" },
        { index: 3, subtype: "Dependent Preposition", tense: "none", tenseUsed: "none" },
      ],
    });
    expect(result.get("a")?.subtype).toBe("other");
    expect(result.get("c")?.subtype).toBe("dependent_preposition");
  });

  it("leaves out skipped, unknown and duplicated items", () => {
    const result = normalizeClassification(items, {
      items: [
        { index: 1, subtype: "tense_choice", tense: "none", tenseUsed: "none" },
        { index: 1, subtype: "other", tense: "none", tenseUsed: "none" },
        { index: 9, subtype: "other", tense: "none", tenseUsed: "none" },
      ],
    });
    expect([...result.keys()]).toEqual(["a"]);
    expect(result.get("a")?.subtype).toBe("tense_choice");
  });
});

describe("buildClassificationPrompt", () => {
  it("lists only the options of each item's category and marks verb mistakes", () => {
    const prompt = buildClassificationPrompt([item({}), item({ category: "articles", original: "a", correction: "the" })]);
    expect(prompt).toContain("Item 1 (verb mistake)");
    expect(prompt).toContain("- tense_choice:");
    expect(prompt).toContain("Item 2\n");
    expect(prompt).toContain("- missing_a_an:");
    expect(prompt).not.toContain("dependent_preposition");
  });
});

describe("sentenceAround", () => {
  it("returns the sentence that contains the fragment", () => {
    const text = "Hi there. Yesterday I have went to the park. It was fun!";
    expect(sentenceAround(text, "have went")).toBe("Yesterday I have went to the park.");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(sentenceAround("First one.\nI  LIVE here since 2020", "i live")).toBe("I LIVE here since 2020");
  });

  it("cuts long sentences around the fragment", () => {
    const text = `${"word ".repeat(100)}the mistake here ${"word ".repeat(100)}`;
    const result = sentenceAround(text, "the mistake here", 60);
    expect(result).toContain("the mistake here");
    expect(result.length).toBeLessThanOrEqual(62);
  });

  it("falls back to the message when the fragment isn't found", () => {
    expect(sentenceAround("Short message", "missing")).toBe("Short message");
  });
});
