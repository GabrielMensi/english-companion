import { describe, expect, it } from "vitest";

import {
  estimateLevel,
  type LevelCorrection,
  type LevelMessage,
  levelEvolution,
  levelOf,
  measureLevel,
  MIN_WORDS,
  recentWindow,
} from "./level-core";
import { cleanText, mattr, scoreDecreasing, scoreIncreasing, tokenize } from "./level-text";

const DAY = 86_400_000;

const SIMPLE = "I like my job. I work in an office. I go to work by bus. My boss is nice. I have lunch at home.";
const ADVANCED =
  "Although the migration had already been planned, we realized that the database, which stores every transaction, " +
  "would require considerable restructuring before we could safely deploy the application to production.";

function message(i: number, text: string, partial: Partial<LevelMessage> = {}): LevelMessage {
  return {
    id: `m${i}`,
    createdAt: i * DAY,
    wordCount: tokenize(text).length,
    text,
    inputMode: "typed",
    tenseCounts: {},
    ...partial,
  };
}

function mistakes(messageId: string, n: number, partial: Partial<LevelCorrection> = {}): LevelCorrection[] {
  return Array.from({ length: n }, () => ({
    messageId,
    severity: "moderate" as const,
    category: "prepositions" as const,
    inputMode: "typed" as const,
    discardedAt: null,
    ...partial,
  }));
}

function repeat(text: string, times: number, from = 0, partial: Partial<LevelMessage> = {}) {
  return Array.from({ length: times }, (_, i) => message(from + i, text, partial));
}

describe("scores", () => {
  it("interpolates between anchors and clamps outside them", () => {
    const anchors = [10, 20, 30, 40, 50, 60];
    expect(scoreIncreasing(5, anchors)).toBe(1);
    expect(scoreIncreasing(25, anchors)).toBe(2.5);
    expect(scoreIncreasing(99, anchors)).toBe(6);
    expect(scoreDecreasing(13, [20, 13, 8, 4.5, 2.2, 1])).toBe(2);
    expect(scoreDecreasing(30, [20, 13, 8, 4.5, 2.2, 1])).toBe(1);
    expect(scoreDecreasing(0.5, [20, 13, 8, 4.5, 2.2, 1])).toBe(6);
  });

  it("maps scores to levels", () => {
    expect(levelOf(0.2)).toBe("A1");
    expect(levelOf(3.4)).toBe("B1");
    expect(levelOf(3.5)).toBe("B2");
    expect(levelOf(9)).toBe("C2");
  });
});

describe("text helpers", () => {
  it("drops code, urls, paths and [spanish] lookups", () => {
    const tokens = tokenize(cleanText("Run `pnpm dev` in src/app, see https://x.com and I want to [aprovechar] it."));
    expect(tokens).toEqual(["run", "in", "see", "and", "i", "want", "to", "it"]);
  });

  it("measures lexical diversity with a moving window", () => {
    expect(mattr(["a", "b", "c", "d"])).toBe(1);
    expect(mattr(["a", "a", "a", "a"])).toBe(0.25);
    const repetitive = Array.from({ length: 200 }, (_, i) => `w${i % 10}`);
    expect(mattr(repetitive, 50)).toBeCloseTo(0.2);
  });
});

describe("estimateLevel", () => {
  it("says nothing without enough writing", () => {
    const messages = repeat(SIMPLE, 2);
    const estimate = estimateLevel({ messages, corrections: [], countTypos: false });
    expect(estimate.level).toBeNull();
    expect(estimate.signals).toEqual([]);
    expect(estimate.wordsNeeded).toBe(MIN_WORDS - estimate.words);
  });

  it("ranks simple writing with many mistakes below complex, accurate writing", () => {
    const simple = repeat(SIMPLE, 20, 0, { tenseCounts: { present_simple: 5 } });
    const advanced = repeat(ADVANCED, 15, 0, {
      tenseCounts: { past_perfect: 1, past_simple: 1, future_perfect: 1, present_perfect: 1, conditional_would: 1 },
    });
    const low = estimateLevel({
      messages: simple,
      corrections: simple.flatMap((m) => mistakes(m.id, 6)),
      countTypos: false,
    });
    const high = estimateLevel({ messages: advanced, corrections: mistakes(advanced[0].id, 2), countTypos: false });

    expect(low.level).toMatch(/^A/);
    expect(high.score!).toBeGreaterThan(low.score! + 1.5);
    expect(high.signals.find((s) => s.id === "grammar")!.score).toBe(3.25);
    expect(low.signals.find((s) => s.id === "accuracy")!.level).toBe("A1");
  });

  it("doesn't count typos, suggestions, discarded mistakes or categories dictation can't measure", () => {
    const messages = repeat(SIMPLE, 20);
    const base = estimateLevel({ messages, corrections: [], countTypos: false });
    const ignored = [
      ...mistakes("m0", 10, { severity: "typo", category: "spelling" }),
      ...mistakes("m1", 10, { severity: "suggestion" }),
      ...mistakes("m2", 10, { inputMode: "spoken", category: "articles" }),
      ...mistakes("m3", 10, { severity: "major", discardedAt: 1 }),
    ];
    expect(estimateLevel({ messages, corrections: ignored, countTypos: false }).score).toBe(base.score);
    expect(estimateLevel({ messages, corrections: ignored, countTypos: true }).score).toBeLessThan(base.score!);
  });

  it("widens the range with less writing", () => {
    const few = estimateLevel({ messages: repeat(ADVANCED, 12), corrections: [], countTypos: false });
    const many = estimateLevel({ messages: repeat(ADVANCED, 120), corrections: [], countTypos: false });
    expect(few.confidence).toBe("low");
    expect(many.confidence).toBe("high");
    const width = (e: typeof few) => e.range!.to.localeCompare(e.range!.from);
    expect(width(few)).toBeGreaterThanOrEqual(width(many));
  });

  it("maps the calibrated mistake rates to levels", () => {
    // SIMPLE has 25 words: 20 messages are 500 words.
    const messages = repeat(SIMPLE, 20);
    const accuracy = (perMessage: number) =>
      estimateLevel({
        messages,
        corrections: messages.flatMap((m) => mistakes(m.id, perMessage)),
        countTypos: false,
      }).signals.find((s) => s.id === "accuracy")!;
    expect(accuracy(0).level).toBe("C2");
    expect(accuracy(1).level).toBe("B2"); // 4 per 100 words
    expect(accuracy(2).level).toBe("A1"); // 8 per 100 words
  });

  it("shows tense range for context without scoring it", () => {
    const plain = repeat(ADVANCED, 15);
    const tenses = repeat(ADVANCED, 15, 0, { tenseCounts: { future_perfect: 2, past_perfect: 2, present_perfect: 2 } });
    const a = estimateLevel({ messages: plain, corrections: [], countTypos: false });
    const b = estimateLevel({ messages: tenses, corrections: [], countTypos: false });
    expect(b.signals.find((s) => s.id === "grammar")!.score).toBeGreaterThan(
      a.signals.find((s) => s.id === "grammar")!.score,
    );
    expect(b.signals.find((s) => s.id === "grammar")!.weight).toBe(0);
    expect(b.score).toBe(a.score);
  });

  it("doesn't let dictated punctuation decide sentence complexity", () => {
    const run = ADVANCED.replace(/,/g, "") + " " + ADVANCED.replace(/,/g, "");
    const chopped = ADVANCED.replace(/,/g, ".");
    const spokenRun = estimateLevel({
      messages: repeat(run, 10, 0, { inputMode: "spoken" }),
      corrections: [],
      countTypos: false,
    });
    const spokenChopped = estimateLevel({
      messages: repeat(chopped, 20, 0, { inputMode: "spoken" }),
      corrections: [],
      countTypos: false,
    });
    const complexity = (e: typeof spokenRun) => e.signals.find((s) => s.id === "complexity")!;
    expect(complexity(spokenRun).weight).toBe(0);
    expect(complexity(spokenRun).value).toMatch(/dictated/);
    expect(spokenRun.score).toBeCloseTo(spokenChopped.score!, 0);

    // Half typed: complexity counts with half its weight, measured on the typed half only.
    const mixed = estimateLevel({
      messages: [...repeat(SIMPLE, 10), ...repeat(run, 5, 10, { inputMode: "spoken" })],
      corrections: [],
      countTypos: false,
    });
    const typedOnly = estimateLevel({ messages: repeat(SIMPLE, 20), corrections: [], countTypos: false });
    expect(complexity(mixed).weight).toBeGreaterThan(0);
    expect(complexity(mixed).weight).toBeLessThan(complexity(typedOnly).weight);
    expect(complexity(mixed).value).toBe(complexity(typedOnly).value);
  });

  it("counts each dictated mistake double, since half the categories aren't measured when speaking", () => {
    const typed = repeat(SIMPLE, 20);
    const spoken = repeat(SIMPLE, 20, 0, { inputMode: "spoken" });
    const typedRate = measureLevel(
      typed,
      typed.map((m) => mistakes(m.id, 1)[0]),
      false,
    ).errorRate;
    const spokenRate = measureLevel(
      spoken,
      spoken.map((m) => mistakes(m.id, 1, { inputMode: "spoken", category: "verb_tense" })[0]),
      false,
    ).errorRate;
    expect(spokenRate).toBe(typedRate * 2);
  });

  it("ignores one-line replies when measuring sentence complexity", () => {
    const essays = repeat(ADVANCED, 15);
    const replies = repeat("Ok, go ahead.", 30, 15);
    const a = measureLevel(essays, [], false);
    const b = measureLevel([...essays, ...replies], [], false);
    expect(b.sentenceLength).toBe(a.sentenceLength);
  });

  it("reports lookups as context only", () => {
    const messages = repeat(SIMPLE, 20);
    const without = estimateLevel({ messages, corrections: [], countTypos: false });
    const withLookups = estimateLevel({ messages, corrections: [], countTypos: false, lookups: 10 });
    expect(withLookups.score).toBe(without.score);
    expect(withLookups.lookupsPer1000Words).toBeGreaterThan(0);
  });
});

describe("recentWindow", () => {
  it("keeps the newest messages up to the word limit, oldest first", () => {
    const messages = [0, 1, 2, 3].map((i) => ({ createdAt: i, wordCount: 100 }));
    expect(recentWindow(messages, 250).map((m) => m.createdAt)).toEqual([2, 3]);
    expect(recentWindow([{ createdAt: 0, wordCount: 999 }], 10)).toHaveLength(1);
  });
});

describe("levelEvolution", () => {
  it("splits the history into chunks and shows improvement", () => {
    const early = repeat(SIMPLE, 20, 0);
    const late = repeat(SIMPLE, 20, 20);
    const corrections = early.flatMap((m) => mistakes(m.id, 3));
    const evolution = levelEvolution({
      messages: [...late, ...early],
      corrections,
      countTypos: false,
      chunkWords: 400,
    });
    expect(evolution).toHaveLength(2);
    expect(evolution[0].from).toBeLessThan(evolution[1].from);
    expect(evolution[0].per100Words).toBeGreaterThan(evolution[1].per100Words);
    expect(evolution[1].score).toBeGreaterThan(evolution[0].score);
  });

  it("joins a short last chunk to the previous one", () => {
    const messages = repeat(SIMPLE, 25);
    const evolution = levelEvolution({ messages, corrections: [], countTypos: false, chunkWords: 400 });
    expect(evolution).toHaveLength(1);
    expect(evolution[0].words).toBe(messages.reduce((n, m) => n + m.wordCount, 0));
  });
});
