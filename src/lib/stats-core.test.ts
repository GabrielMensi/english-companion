import { describe, expect, it } from "vitest";
import { bucketKey, computeStats, type StatCorrection, type StatsInput } from "./stats-core";

const DAY = 86_400_000;
const now = new Date(2026, 8, 26, 12).getTime();

function correction(partial: Partial<StatCorrection>): StatCorrection {
  return {
    messageId: "m1",
    createdAt: now - DAY,
    category: "articles",
    subcategory: "missing_article",
    severity: "minor",
    original: "go to park",
    correction: "go to the park",
    explanation: "...",
    ...partial,
  };
}

function input(partial: Partial<StatsInput>): StatsInput {
  return {
    from: now - 7 * DAY,
    now,
    countTypos: false,
    messages: [],
    corrections: [],
    previousMessages: [],
    previousCorrections: [],
    ...partial,
  };
}

describe("computeStats", () => {
  it("excludes typos from error counts unless enabled", () => {
    const data = input({
      messages: [{ createdAt: now - DAY, wordCount: 50 }],
      corrections: [correction({}), correction({ severity: "typo", category: "spelling" })],
    });
    const stats = computeStats(data);
    expect(stats.totals.errors).toBe(1);
    expect(stats.totals.typos).toBe(1);
    expect(stats.totals.per100Words).toBe(2);
    expect(computeStats({ ...data, countTypos: true }).totals.errors).toBe(2);
  });

  it("ranks categories by severity-weighted score", () => {
    const stats = computeStats(
      input({
        messages: [{ createdAt: now - DAY, wordCount: 100 }],
        corrections: [
          correction({ category: "articles" }),
          correction({ category: "articles" }),
          correction({ category: "verb_tense", severity: "major" }),
        ],
      }),
    );
    expect(stats.categories.map((c) => [c.category, c.score])).toEqual([
      ["verb_tense", 3],
      ["articles", 2],
    ]);
  });

  it("computes trends against the previous period, including solved categories", () => {
    const stats = computeStats(
      input({
        messages: [{ createdAt: now - DAY, wordCount: 100 }],
        corrections: [correction({ category: "articles" })],
        previousMessages: [{ createdAt: now - 10 * DAY, wordCount: 100 }],
        previousCorrections: [
          correction({ category: "articles", createdAt: now - 10 * DAY }),
          correction({ category: "articles", createdAt: now - 10 * DAY }),
          correction({ category: "prepositions", createdAt: now - 10 * DAY }),
        ],
      }),
    );
    const byCategory = Object.fromEntries(stats.categories.map((c) => [c.category, c]));
    expect(byCategory.articles.trend).toBe(-1);
    expect(byCategory.prepositions.count).toBe(0);
    expect(byCategory.prepositions.trend).toBe(-1);
    expect(stats.totals.previousPer100Words).toBe(3);
  });

  it("counts messages without errors", () => {
    const stats = computeStats(
      input({
        messages: [
          { createdAt: now - DAY, wordCount: 10 },
          { createdAt: now - DAY, wordCount: 10 },
        ],
        corrections: [correction({ messageId: "a" }), correction({ messageId: "a" })],
      }),
    );
    expect(stats.totals.cleanMessagesPct).toBe(50);
  });

  it("builds a daily timeline covering the whole period", () => {
    const stats = computeStats(input({ messages: [{ createdAt: now - DAY, wordCount: 10 }] }));
    expect(stats.timeline).toHaveLength(8);
    expect(stats.timeline.find((b) => b.words === 10)?.bucket).toBe(bucketKey(now - DAY, false));
  });

  it("groups top mistakes by subcategory with the latest example", () => {
    const stats = computeStats(
      input({
        corrections: [
          correction({ createdAt: now - 3 * DAY, original: "old" }),
          correction({ createdAt: now - DAY, original: "new" }),
          correction({ subcategory: "other_thing" }),
        ],
      }),
    );
    expect(stats.topMistakes[0]).toMatchObject({ subcategory: "missing_article", count: 2, example: { original: "new" } });
  });
});

describe("bucketKey", () => {
  it("uses the Monday of the week for weekly buckets", () => {
    expect(bucketKey(new Date(2026, 8, 26).getTime(), true)).toBe("2026-09-21");
  });
});
