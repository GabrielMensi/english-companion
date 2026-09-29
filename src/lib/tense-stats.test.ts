import { describe, expect, it } from "vitest";
import { computeTenseStats, type TenseStatCorrection, type TenseStatMessage } from "./tense-stats";

function correction(partial: Partial<TenseStatCorrection>): TenseStatCorrection {
  return {
    createdAt: 1,
    category: "verb_tense",
    severity: "moderate",
    tense: "present_perfect",
    tenseUsed: "past_simple",
    classification: "done",
    original: "I lived",
    correction: "I have lived",
    ...partial,
  };
}

const message = (tenseCounts: TenseStatMessage["tenseCounts"], wordCount = 50): TenseStatMessage => ({ tenseCounts, wordCount });

function stats(input: Partial<Parameters<typeof computeTenseStats>[0]>) {
  return computeTenseStats({
    countTypos: false,
    messages: [],
    corrections: [],
    previousMessages: [],
    previousCorrections: [],
    ...input,
  });
}

describe("computeTenseStats", () => {
  it("computes accuracy from uses and mistakes, splitting usage and form errors", () => {
    const result = stats({
      messages: [message({ present_perfect: 6 }), message({ present_perfect: 4, past_simple: 2 })],
      corrections: [
        correction({}),
        correction({ category: "verb_form", tenseUsed: null, original: "have wrote", correction: "have written" }),
      ],
    });
    const perfect = result.tenses.find((t) => t.tense === "present_perfect")!;
    expect(perfect).toMatchObject({ uses: 10, usageErrors: 1, formErrors: 1, accuracy: 80 });
    expect(perfect.confusedWith).toEqual([{ tense: "past_simple", count: 1, example: { original: "I lived", correction: "I have lived" } }]);
  });

  it("doesn't give an accuracy with too few uses, and smooths small samples", () => {
    const result = stats({ messages: [message({ past_perfect: 1 })] });
    expect(result.tenses[0]).toMatchObject({ tense: "past_perfect", uses: 1, accuracy: null, status: "not_enough_data" });
    expect(result.tenses[0].smoothedAccuracy).toBeCloseTo(66.7);
  });

  it("classifies strong, shaky and weak tenses", () => {
    const result = stats({
      messages: [message({ present_simple: 30, past_simple: 8, present_perfect: 6 })],
      corrections: [
        correction({ tense: "present_perfect" }),
        correction({ tense: "present_perfect" }),
        correction({ tense: "present_perfect" }),
      ],
    });
    const status = Object.fromEntries(result.tenses.map((t) => [t.tense, t.status]));
    expect(status).toEqual({ present_simple: "strong", past_simple: "shaky", present_perfect: "weak" });
  });

  it("never has fewer uses than mistakes, even if the counter missed them", () => {
    const result = stats({ corrections: [correction({}), correction({})] });
    expect(result.tenses[0]).toMatchObject({ tense: "present_perfect", uses: 2, usageErrors: 2 });
  });

  it("flags common tenses that are barely used in a lot of writing", () => {
    const result = stats({ messages: [message({ present_simple: 60 }, 1200)] });
    expect(result.tenses.filter((t) => t.status === "avoided").map((t) => t.tense)).toEqual([
      "present_continuous",
      "past_simple",
      "present_perfect",
      "future_will",
      "future_going_to",
    ]);
  });

  it("measures present continuous for the future as present continuous", () => {
    const result = stats({
      messages: [message({ present_continuous: 5 })],
      corrections: [correction({ tense: "future_present_continuous", tenseUsed: "future_will" })],
    });
    expect(result.tenses).toHaveLength(1);
    expect(result.tenses[0]).toMatchObject({ tense: "present_continuous", usageErrors: 1 });
    expect(result.tenses[0].confusedWith[0].tense).toBe("future_will");
  });

  it("ignores suggestions, typos and unclassified mistakes, and counts the pending ones", () => {
    const result = stats({
      messages: [message({ present_perfect: 5 })],
      corrections: [
        correction({ severity: "suggestion" }),
        correction({ tense: null, tenseUsed: null, classification: "pending" }),
        correction({ category: "articles", tense: null, tenseUsed: null, classification: "pending" }),
      ],
    });
    expect(result.tenses[0]).toMatchObject({ usageErrors: 0, accuracy: 100 });
    expect(result.unclassified).toBe(1);
  });

  it("computes the trend against the previous period", () => {
    const result = stats({
      messages: [message({ present_perfect: 10 })],
      corrections: [correction({})],
      previousMessages: [message({ present_perfect: 10 })],
      previousCorrections: [correction({}), correction({}), correction({})],
    });
    expect(result.tenses[0]).toMatchObject({ accuracy: 90, trend: 20 });
  });
});
