import { describe, expect, it } from "vitest";

import {
  computeFluency,
  computeFluencyStats,
  type FluencyMetrics,
  fluencySummary,
  mergeFluency,
  type TimedWord,
  wordsFromResponse,
} from "./fluency";

/** Words spoken back to back, 0.3 s each, with extra silence where the text has "|". */
function timed(text: string, pauseSeconds = 1.5): TimedWord[] {
  const words: TimedWord[] = [];
  let t = 0.5;
  for (const token of text.split(" ")) {
    if (token === "|") {
      t += pauseSeconds;
      continue;
    }
    words.push({ word: token, start: t, end: t + 0.3 });
    t += 0.3;
  }
  return words;
}

describe("computeFluency", () => {
  it("returns null without words", () => {
    expect(computeFluency([])).toBeNull();
    expect(computeFluency([{ word: "...", start: 0, end: 1 }])).toBeNull();
  });

  it("measures speech from the first word to the last one", () => {
    const m = computeFluency(timed("I went to the store yesterday"))!;
    expect(m.words).toBe(6);
    expect(m.speechMs).toBe(1800);
    expect(m.pauses).toBe(0);
  });

  it("counts silences of a second or more as long pauses", () => {
    const m = computeFluency(timed("I went | to the | store", 2))!;
    expect(m.pauses).toBe(2);
    expect(m.pauseMs).toBe(4000);
    expect(m.longestPauseMs).toBe(2000);
  });

  it("ignores short silences", () => {
    expect(computeFluency(timed("I went | to", 0.8))!.pauses).toBe(0);
  });

  it("counts English hesitations and Spanish fillers, not as words", () => {
    const m = computeFluency(timed("Um, I went, eh, to the... este store, o sea, Uhh yesterday"))!;
    expect(m.fillers).toEqual({ um: 1, eh: 1, este: 1, "o sea": 1, uh: 1 });
    expect(m.words).toBe(6);
  });

  it("doesn't take words with a meaning for fillers", () => {
    const m = computeFluency(timed("I like it, well, you know"))!;
    expect(m.fillers).toEqual({});
    expect(m.words).toBe(6);
  });

  it("sorts words that come out of order", () => {
    const m = computeFluency([
      { word: "store", start: 2, end: 2.5 },
      { word: "the", start: 0, end: 0.2 },
    ])!;
    expect(m.speechMs).toBe(2500);
    expect(m.pauses).toBe(1);
  });
});

describe("mergeFluency", () => {
  it("adds up two takes", () => {
    const a = computeFluency(timed("um I went | there"))!;
    const b = computeFluency(timed("and um eh came back"))!;
    const merged = mergeFluency(a, b)!;
    expect(merged.words).toBe(a.words + b.words);
    expect(merged.speechMs).toBe(a.speechMs + b.speechMs);
    expect(merged.pauses).toBe(1);
    expect(merged.fillers).toEqual({ um: 2, eh: 1 });
  });

  it("keeps the other side when one is missing", () => {
    const a = computeFluency(timed("hello there"));
    expect(mergeFluency(a, null)).toBe(a);
    expect(mergeFluency(null, a)).toBe(a);
    expect(mergeFluency(null, null)).toBeNull();
  });
});

describe("fluencySummary", () => {
  const metrics: FluencyMetrics = {
    version: 1,
    words: 120,
    speechMs: 60_000,
    pauses: 3,
    pauseMs: 5000,
    longestPauseMs: 2500,
    fillers: { um: 4, este: 2 },
  };

  it("derives rates per minute and per 100 words", () => {
    expect(fluencySummary(metrics)).toEqual({
      wpm: 120,
      pausesPerMinute: 3,
      fillerCount: 6,
      fillersPer100Words: 5,
      topFillers: [
        { filler: "um", count: 4 },
        { filler: "este", count: 2 },
      ],
    });
  });

  it("doesn't give a pace for very short recordings", () => {
    const s = fluencySummary({ ...metrics, words: 2, speechMs: 900 });
    expect(s.wpm).toBeNull();
    expect(s.pausesPerMinute).toBeNull();
  });
});

describe("computeFluencyStats", () => {
  it("adds up the messages of each period", () => {
    const one = computeFluency(timed("I think that we should go to the park tomorrow um"));
    const stats = computeFluencyStats([{ fluency: one }, { fluency: one }, { fluency: null }], []);
    expect(stats.messages).toBe(2);
    expect(stats.current?.fillerCount).toBe(2);
    expect(stats.previous).toBeNull();
  });
});

describe("wordsFromResponse", () => {
  it("reads verbose_json words", () => {
    expect(wordsFromResponse({ text: "Hi", words: [{ word: "Hi", start: 0.1, end: 0.4 }] })).toEqual([
      { word: "Hi", start: 0.1, end: 0.4 },
    ]);
  });

  it("ignores malformed responses", () => {
    expect(wordsFromResponse(null)).toEqual([]);
    expect(wordsFromResponse("text")).toEqual([]);
    expect(wordsFromResponse({ words: [{ word: "Hi" }, null] })).toEqual([]);
  });
});
