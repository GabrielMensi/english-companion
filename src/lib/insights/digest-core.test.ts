import { describe, expect, it } from "vitest";
import { computeStats, type StatCorrection } from "@/lib/stats-core";
import { computeTenseStats, type TenseStatCorrection } from "@/lib/tense-stats";
import type { VocabularyWord } from "@/lib/vocabulary-core";
import { pronunciationProgress, summarizePronunciation } from "@/lib/read-aloud-core";
import { buildDigest, digestToMarkdown, digestToPromptText } from "./digest-core";

const DAY = 86_400_000;
const now = new Date(2026, 8, 30, 12).getTime();

type Row = StatCorrection & TenseStatCorrection;

function correction(partial: Partial<Row>): Row {
  return {
    id: "c1",
    messageId: "m1",
    createdAt: now - DAY,
    category: "prepositions",
    subcategory: "depend_on",
    subtype: null,
    severity: "moderate",
    original: "depends of",
    correction: "depends on",
    explanation: "...",
    inputMode: "typed",
    tense: null,
    tenseUsed: null,
    classification: "done",
    discardedAt: null,
    ...partial,
  };
}

function word(spanish: string, english: string, times: number): VocabularyWord {
  return {
    key: spanish,
    spanish,
    english: [english],
    source: "app",
    note: null,
    timesLookedUp: times,
    firstSeen: now,
    lastSeen: now,
    ids: [],
    contexts: [],
  };
}

function digestFor(
  corrections: Row[],
  previous: Row[],
  vocabulary: VocabularyWord[] = [],
  pronunciation: Parameters<typeof buildDigest>[0]["pronunciation"] = null,
) {
  const messages = [{ createdAt: now - DAY, wordCount: 200, tenseCounts: { past_simple: 8, present_perfect: 6 } }];
  const previousMessages = [{ createdAt: now - 9 * DAY, wordCount: 200, tenseCounts: {} }];
  const base = { countTypos: false, messages, corrections, previousMessages, previousCorrections: previous };
  return buildDigest({
    days: 7,
    now,
    stats: computeStats({ ...base, from: now - 7 * DAY, now }),
    tenses: computeTenseStats(base),
    vocabulary,
    pronunciation,
  });
}

describe("buildDigest", () => {
  const current = [
    ...Array.from({ length: 4 }, () => correction({})),
    correction({ category: "articles", original: "the life", correction: "life", severity: "minor" }),
    correction({ category: "spelling", severity: "typo", original: "teh", correction: "the" }),
    ...Array.from({ length: 3 }, () =>
      correction({
        category: "verb_tense",
        tense: "present_perfect",
        tenseUsed: "past_simple",
        original: "I live here since 2020",
        correction: "I have lived here since 2020",
      }),
    ),
  ];
  const previous = [
    correction({ createdAt: now - 9 * DAY }),
    ...Array.from({ length: 5 }, () => correction({ createdAt: now - 9 * DAY, category: "articles" })),
  ];

  it("summarizes weak areas, trends, tenses, mistakes and vocabulary", () => {
    const d = digestFor(current, previous, [word("aprovechar", "take advantage of", 1), word("lograr", "achieve", 3)]);

    expect(d.totals).toMatchObject({ messages: 1, words: 200, errors: 8 });
    expect(d.weakest[0].category).toBe("prepositions");
    expect(d.weakest.map((a) => a.category)).not.toContain("spelling"); // typos don't count
    expect(d.worsened.map((a) => a.category)).toContain("prepositions");
    expect(d.improved.map((a) => a.category)).toEqual(["articles"]);
    expect(d.tenses[0]).toMatchObject({ tense: "present_perfect", status: "weak", confusedWith: "Past simple" });
    expect(d.topMistakes[0]).toMatchObject({ count: 4, original: "depends of" });
    expect(d.vocabulary[0]).toEqual({ spanish: "lograr", english: "achieve", times: 3 });
  });

  it("renders the digest as model text and as Markdown", () => {
    const d = digestFor(current, previous);
    const text = digestToPromptText(d);
    expect(text).toContain("Period: the last 7 days.");
    expect(text).toContain('"depends of" → "depends on"');
    expect(text).toContain("Present perfect: weak");

    const plan = {
      summary: "Good week.",
      focus: [
        { topic: "Prepositions", why: "4 mistakes", practice: "Write 5 sentences", example: "It depends on you." },
      ],
      goal: "Fewer than 1 per 100 words",
    };
    const md = digestToMarkdown(d, plan);
    expect(md).toMatch(/^# English report — Last 7 days/);
    expect(md).toContain("~~depends of~~ → depends on");
    expect(md).toContain("### 1. Prepositions");
    expect(md).not.toContain("## Words I looked up");
    expect(digestToMarkdown(d)).not.toContain("## Study plan");
  });

  it("handles an empty period", () => {
    const d = digestFor([], []);
    expect(d.weakest).toEqual([]);
    expect(d.topMistakes).toEqual([]);
    expect(digestToPromptText(d)).toContain("Weakest areas (weakest first):\n- none");
  });
});

describe("pronunciation in the digest", () => {
  const ship = { category: "vowel_length" as const, expected: "ship", heard: "sheep" };
  const current = summarizePronunciation(
    [
      { correctWords: 9, totalWords: 10 },
      { correctWords: 8, totalWords: 10 },
    ],
    [ship, ship, { category: "th_sounds" as const, expected: "think", heard: "tink" }],
  );
  const previous = summarizePronunciation([{ correctWords: 7, totalWords: 10 }], [ship, ship, ship]);

  it("summarizes accuracy, problem sounds and the trend", () => {
    const d = digestFor([], [], [], pronunciationProgress(current, previous));
    expect(d.pronunciation).toMatchObject({ readings: 2, words: 20, accuracy: 85, previousAccuracy: 70 });
    expect(d.pronunciation?.sounds[0]).toMatchObject({
      category: "vowel_length",
      count: 2,
      per100Words: 10,
      trend: -20,
      example: { expected: "ship", heard: "sheep" },
    });
    // Only sounds heard differently in this period.
    expect(d.pronunciation?.sounds.every((s) => s.count > 0)).toBe(true);

    const text = digestToPromptText(d);
    expect(text).toContain("Pronunciation (read-aloud practice");
    expect(text).toContain("85% of 20 words heard as written in 2 readings (previous period: 70%)");
    expect(text).toContain('"ship" heard as "sheep"');
    expect(digestToMarkdown(d)).toContain("## Pronunciation (reading aloud)");
  });

  it("leaves it out without readings", () => {
    const none = summarizePronunciation([], []);
    for (const p of [null, pronunciationProgress(none, none)]) {
      const d = digestFor([], [], [], p);
      expect(d.pronunciation).toBeNull();
      expect(digestToPromptText(d)).not.toContain("Pronunciation");
      expect(digestToMarkdown(d)).not.toContain("Pronunciation");
    }
  });

  it("keeps it when there were readings only in the previous period", () => {
    const d = digestFor([], [], [], pronunciationProgress(summarizePronunciation([], []), previous));
    expect(d.pronunciation).toMatchObject({ readings: 0, accuracy: null, previousAccuracy: 70, sounds: [] });
    expect(digestToPromptText(d)).toContain("No readings in this period (previous period: 70%)");
  });
});
