import { describe, expect, it } from "vitest";
import {
  parseFocus,
  pronunciationCards,
  pronunciationProgress,
  readableSentences,
  soundItems,
  soundOrder,
  summarizePronunciation,
} from "./read-aloud-core";

describe("readableSentences", () => {
  it("keeps plain sentences of a readable length", () => {
    expect(
      readableSentences(
        "I went to the store yesterday. Hi! It cost 30 dollars. We use `pnpm dev` every day.\nShe has lived here for years?",
      ),
    ).toEqual(["I went to the store yesterday.", "She has lived here for years?"]);
  });

  it("drops very long sentences", () => {
    expect(readableSentences(`${"word ".repeat(25).trim()}.`)).toEqual([]);
  });
});

describe("summarizePronunciation", () => {
  it("adds up accuracy and groups issues by category, most first", () => {
    const summary = summarizePronunciation(
      [
        { correctWords: 4, totalWords: 5 },
        { correctWords: 5, totalWords: 5 },
      ],
      [
        { category: "th_sounds", expected: "think", heard: "sink" },
        { category: "vowel_length", expected: "ship", heard: "sheep" },
        { category: "vowel_length", expected: "ship", heard: "sheep" },
        { category: "vowel_length", expected: "live", heard: "leave" },
      ],
    );
    expect(summary.attempts).toBe(2);
    expect(summary.accuracy).toBe(0.9);
    expect(summary.categories).toEqual([
      {
        category: "vowel_length",
        count: 3,
        examples: [
          { expected: "ship", heard: "sheep", count: 2 },
          { expected: "live", heard: "leave", count: 1 },
        ],
      },
      { category: "th_sounds", count: 1, examples: [{ expected: "think", heard: "sink", count: 1 }] },
    ]);
  });

  it("has no accuracy without attempts", () => {
    expect(summarizePronunciation([], []).accuracy).toBeNull();
  });
});

describe("pronunciationProgress", () => {
  const current = summarizePronunciation(
    [{ correctWords: 45, totalWords: 50 }],
    [
      { category: "th_sounds", expected: "think", heard: "sink" },
      { category: "th_sounds", expected: "three", heard: "tree" },
      { category: "b_v", expected: "vote", heard: "boat" },
    ],
  );
  const previous = summarizePronunciation(
    [{ correctWords: 80, totalWords: 100 }],
    [
      { category: "th_sounds", expected: "think", heard: "sink" },
      { category: "vowel_length", expected: "ship", heard: "sheep" },
      { category: "vowel_length", expected: "live", heard: "leave" },
    ],
  );

  it("compares rates per 100 words read with the previous period", () => {
    const progress = pronunciationProgress(current, previous);
    expect(progress).toMatchObject({ attempts: 1, words: 50, accuracy: 0.9, previousAccuracy: 0.8 });
    expect(progress.categories.map((c) => [c.category, c.count, c.per100Words, c.trend])).toEqual([
      ["th_sounds", 2, 4, 3],
      ["b_v", 1, 2, 2],
      // Only in the previous period: solved.
      ["vowel_length", 0, 0, -2],
    ]);
  });

  it("has no trend without readings in the previous period", () => {
    const progress = pronunciationProgress(current, summarizePronunciation([], []));
    expect(progress.previousAccuracy).toBeNull();
    expect(progress.categories.map((c) => c.trend)).toEqual([null, null]);
    expect(pronunciationProgress(current, null).categories).toHaveLength(2);
  });
});

describe("soundOrder / soundItems", () => {
  it("puts the weakest sounds first and leaves out other", () => {
    const summary = summarizePronunciation(
      [],
      [
        { category: "other", expected: "a", heard: "b" },
        { category: "b_v", expected: "vote", heard: "boat" },
      ],
    );
    const order = soundOrder(summary);
    expect(order[0]).toBe("b_v");
    expect(order).not.toContain("other");
    expect(order).toHaveLength(7);
    expect(soundItems(order)[0]).toMatchObject({ source: "sounds", focus: "b_v", target: "vest" });
  });
});

describe("parseFocus", () => {
  it("accepts a sound with built-in sentences", () => {
    expect(parseFocus("th_sounds")).toBe("th_sounds");
    expect(parseFocus(["b_v", "th_sounds"])).toBe("b_v");
  });

  it("falls back to all sounds for anything else", () => {
    expect(parseFocus(undefined)).toBeNull();
    expect(parseFocus("")).toBeNull();
    expect(parseFocus("other")).toBeNull();
    expect(parseFocus("verb_tense")).toBeNull();
  });
});

describe("pronunciationCards", () => {
  const row = (attemptId: string, createdAt: number, expected: string, heard: string, text = "I saw a big ship.") => ({
    text,
    attemptId,
    createdAt,
    expected,
    heard,
    category: "vowel_length" as const,
    detail: null,
  });

  it("makes one card per sentence, newest first, with its words most repeated first", () => {
    const cards = pronunciationCards([
      row("a1", 1, "big", "beg"),
      row("a1", 1, "ship", "sheep"),
      row("a2", 5, "ship", "sheep"),
      row("a3", 3, "think", "sink", "I  think so. "),
    ]);
    expect(cards.map((c) => c.key)).toEqual(["I saw a big ship.", "I think so."]);
    expect(cards[0]).toMatchObject({ timesMissed: 2, lastMissedAt: 5 });
    expect(cards[0].words.map((w) => w.expected)).toEqual(["ship", "big"]);
  });
});
