import { describe, expect, it } from "vitest";
import type { StatsDigest } from "./digest-core";
import type { LevelEstimate } from "./level-core";
import {
  buildLevelInstructions,
  buildLevelPrompt,
  buildPlanInstructions,
  buildPlanPrompt,
  isExplanationCurrent,
  MAX_FOCUS,
  normalizeLevelExplanation,
  normalizePlan,
} from "./plan-core";

const focus = (topic: string) => ({ topic, why: " why ", practice: "do it", example: "Example." });

describe("study plan", () => {
  it("writes explanations in the chosen language", () => {
    expect(buildPlanInstructions("es")).toContain("Spanish");
    expect(buildPlanInstructions("en")).not.toContain("Spanish (Rioplatense");
  });

  it("wraps the digest text", () => {
    const digest = {
      period: { days: 7, from: 0, to: 1 },
      totals: { messages: 1, words: 10, errors: 0, per100Words: 0, previousPer100Words: null, cleanMessagesPct: 100 },
      weakest: [],
      worsened: [],
      improved: [],
      tenses: [],
      unclassifiedTenses: 0,
      topMistakes: [],
      vocabulary: [],
    } satisfies StatsDigest;
    expect(buildPlanPrompt(digest)).toMatch(/^Statistics:\n<<<\nPeriod: the last 7 days\./);
  });

  it("trims, drops empty topics and caps the number of topics", () => {
    const plan = normalizePlan({
      summary: " ok ",
      focus: [focus("A"), { ...focus(""), topic: " " }, focus("B"), focus("C"), focus("D"), focus("E")],
      goal: " goal ",
    });
    expect(plan.summary).toBe("ok");
    expect(plan.goal).toBe("goal");
    expect(plan.focus.map((f) => f.topic)).toEqual(["A", "B", "C", "D"].slice(0, MAX_FOCUS));
    expect(plan.focus[0].why).toBe("why");
  });

  it("rejects a plan without topics", () => {
    expect(() => normalizePlan({ summary: "x", focus: [], goal: "" })).toThrow();
  });
});

describe("level explanation", () => {
  const estimate: LevelEstimate = {
    level: "B1",
    score: 3.2,
    position: "mid",
    range: { from: "A2", to: "B2" },
    confidence: "medium",
    words: 1500,
    messages: 30,
    wordsNeeded: 0,
    lookupsPer1000Words: 0.7,
    period: { from: 0, to: 1 },
    signals: [
      { id: "accuracy", label: "Accuracy", score: 3.4, level: "B1", weight: 0.4, value: "6.3 mistakes per 100 words", basis: "…" },
    ],
  };

  it("gives the model the rule-based result and forbids changing it", () => {
    expect(buildLevelInstructions("en")).toContain("you do NOT change it");
    const prompt = buildLevelPrompt(estimate, []);
    expect(prompt).toContain("Estimated level: B1");
    expect(prompt).toContain("Accuracy (weight 40%): 6.3 mistakes per 100 words → B1");
    expect(prompt).toContain("not scored");
  });

  it("refuses to explain a missing estimate", () => {
    expect(() => buildLevelPrompt({ ...estimate, level: null }, [])).toThrow();
  });

  it("normalizes the output", () => {
    expect(normalizeLevelExplanation({ explanation: " x ", nextSteps: [" a", "", "b", "c", "d"] })).toEqual({
      explanation: "x",
      nextSteps: ["a", "b", "c"],
    });
  });

  it("keeps a stored explanation only while the estimate is about the same", () => {
    expect(isExplanationCurrent({ level: "B1", words: 1450 }, estimate)).toBe(true);
    expect(isExplanationCurrent({ level: "A2", words: 1500 }, estimate)).toBe(false);
    expect(isExplanationCurrent({ level: "B1", words: 900 }, estimate)).toBe(false);
    expect(isExplanationCurrent(null, estimate)).toBe(false);
  });
});
