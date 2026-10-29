import { describe, expect, it } from "vitest";

import {
  classReportToMarkdown,
  classWordCount,
  mistakeOrigin,
  compareWithTeacher,
  MAX_CLASS_ITEMS,
  normalizeClassImport,
  normalizeClassQuestions,
  parseDay,
  periodKey,
  resolveReportPeriod,
} from "./class-core";
import { buildDigest } from "./insights/digest-core";
import { computeStats } from "./stats-core";
import { countsInStats } from "./taxonomy";
import { computeTenseStats } from "./tense-stats";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 12).getTime();
const meetings = [
  { id: "old", heldAt: NOW - 20 * DAY, teacherLevel: null },
  { id: "last", heldAt: NOW - 6 * DAY, teacherLevel: "B1" as const },
  { id: "future", heldAt: NOW + 3 * DAY, teacherLevel: null },
];

describe("resolveReportPeriod", () => {
  it("defaults to since the most recent class that already happened", () => {
    const period = resolveReportPeriod(meetings, {}, NOW);
    expect(period).toMatchObject({ from: NOW - 6 * DAY, to: NOW, since: { id: "last" } });
  });

  it("starts at a picked class, even an older one", () => {
    expect(resolveReportPeriod(meetings, { sinceId: "old" }, NOW).from).toBe(NOW - 20 * DAY);
  });

  it("ignores a class in the future or unknown and falls back to the last one", () => {
    expect(resolveReportPeriod(meetings, { sinceId: "future" }, NOW).since?.id).toBe("last");
    expect(resolveReportPeriod(meetings, { sinceId: "nope" }, NOW).since?.id).toBe("last");
  });

  it("uses the last 7 days without classes", () => {
    expect(resolveReportPeriod([], {}, NOW)).toEqual({ from: NOW - 7 * DAY, to: NOW, since: null });
  });

  it("picked dates win: from the start of the first day to the end of the last (capped at now)", () => {
    const period = resolveReportPeriod(meetings, { sinceId: "old", from: "2026-10-20", to: "2026-10-22" }, NOW);
    expect(period).toEqual({ from: new Date(2026, 9, 20).getTime(), to: new Date(2026, 9, 23).getTime(), since: null });
    expect(resolveReportPeriod(meetings, { from: "2026-10-20" }, NOW).to).toBe(NOW);
  });

  it("falls back when the dates are invalid or backwards", () => {
    expect(resolveReportPeriod(meetings, { from: "2026-13-40" }, NOW).since?.id).toBe("last");
    expect(resolveReportPeriod(meetings, { from: "2026-10-22", to: "2026-10-20" }, NOW).since?.id).toBe("last");
  });
});

describe("parseDay", () => {
  it("only accepts real YYYY-MM-DD dates", () => {
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("26-1-1")).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay("2026-02-28")).toBe(new Date(2026, 1, 28).getTime());
  });
});

describe("compareWithTeacher", () => {
  it("says how many levels apart the estimate is", () => {
    expect(compareWithTeacher({ level: "B1" }, "B1")).toMatchObject({ difference: 0 });
    expect(compareWithTeacher({ level: "B2" }, "B1")?.text).toBe(
      "The app's estimate is one level above the teacher's.",
    );
    expect(compareWithTeacher({ level: "A2" }, "B2")?.text).toBe("The app's estimate is 2 levels below the teacher's.");
    expect(compareWithTeacher({ level: null }, "B1")).toBeNull();
  });
});

describe("normalizeClassImport", () => {
  const error = (original: string, correction: string, extra = {}) => ({
    original,
    correction,
    category: "verb_tense" as const,
    subcategory: "Past Simple!",
    severity: "moderate" as const,
    explanation: " Past. ",
    ...extra,
  });

  it("cleans, snake_cases the label and drops no-ops and duplicates", () => {
    const result = normalizeClassImport({
      corrections: [
        error(" I have went ", "I went"),
        error("i have went", "I went"),
        error("same", "same"),
        error("", "x"),
        error("teh", "the", { severity: "typo", subcategory: "" }),
      ],
      words: [],
    });
    expect(result.corrections.map((c) => c.original)).toEqual(["I have went", "teh"]);
    expect(result.corrections[0]).toMatchObject({ subcategory: "past_simple", explanation: "Past." });
    // Said in class, never a keyboard slip; an empty label falls back to the category.
    expect(result.corrections[1]).toMatchObject({ severity: "minor", subcategory: "verb_tense" });
  });

  it("drops spelling, punctuation and capitalization: said in class, they aren't measurable", () => {
    const result = normalizeClassImport({
      corrections: [
        error("freinds", "friends", { category: "spelling" }),
        error("hello,", "hello", { category: "punctuation" }),
        error("i", "I", { category: "capitalization" }),
        error("I have went", "I went"),
      ],
      words: [],
    });
    expect(result.corrections.map((c) => c.original)).toEqual(["I have went"]);
  });

  it("keeps one entry per word (by its Spanish) with up to 3 English options", () => {
    const result = normalizeClassImport({
      corrections: [],
      words: [
        { spanish: "Lista de deseos", english: ["bucket list", " ", "wish list", "a", "b"], note: " " },
        { spanish: "lista de deseos", english: ["other"], note: null },
        { spanish: "x", english: [], note: null },
      ],
    });
    expect(result.words).toEqual([
      { spanish: "Lista de deseos", english: ["bucket list", "wish list", "a"], note: null },
    ]);
  });

  it("caps the number of items", () => {
    const many = Array.from({ length: MAX_CLASS_ITEMS + 10 }, (_, i) => error(`bad ${i}`, `good ${i}`));
    expect(normalizeClassImport({ corrections: many, words: [] }).corrections).toHaveLength(MAX_CLASS_ITEMS);
  });
});

describe("classWordCount", () => {
  it("is what the learner said they spoke, or 0 (then the mistakes stay out of the rates)", () => {
    expect(classWordCount(300)).toBe(300);
    expect(classWordCount(null)).toBe(0);
    expect(classWordCount(0)).toBe(0);
  });
});

describe("normalizeClassQuestions", () => {
  it("trims, drops empty questions and keeps five", () => {
    const raw = { questions: Array.from({ length: 8 }, (_, i) => ({ ask: i === 0 ? " " : ` Q${i} `, why: " w " })) };
    const result = normalizeClassQuestions(raw);
    expect(result.questions).toHaveLength(5);
    expect(result.questions[0]).toEqual({ ask: "Q1", why: "w" });
    expect(() => normalizeClassQuestions({ questions: [] })).toThrow();
  });

  it("the key changes with the period start and the data", () => {
    expect(periodKey({ from: NOW }, 3)).not.toBe(periodKey({ from: NOW }, 4));
    expect(periodKey({ from: NOW }, 3)).toBe(periodKey({ from: NOW + 1000 }, 3));
  });
});

describe("classReportToMarkdown", () => {
  it("titles the report with the class date and adds the level and the questions", () => {
    const stats = computeStats({
      from: null,
      now: NOW,
      countTypos: false,
      messages: [],
      corrections: [],
      previousMessages: [],
      previousCorrections: [],
    });
    const tenses = computeTenseStats({
      countTypos: false,
      messages: [],
      corrections: [],
      previousMessages: [],
      previousCorrections: [],
    });
    const digest = buildDigest({ days: 6, now: NOW, stats, tenses, vocabulary: [] });
    const markdown = classReportToMarkdown(digest, {
      since: meetings[1],
      teacher: { heldAt: meetings[1].heldAt, level: "B1" },
      appLevel: "B2",
      questions: { questions: [{ ask: "Can we practice the present perfect?", why: "6 mistakes" }] },
    });
    expect(markdown).toContain("# English report to take to class — since the class on 2026-10-22");
    expect(markdown).toContain("- App's estimate (from my writing): B2");
    expect(markdown).toContain("- Teacher's level on 2026-10-22: B1");
    expect(markdown).toContain("## What to ask the teacher\n\n- Can we practice the present perfect? _(6 mistakes)_");
  });
});

describe("mistakeOrigin", () => {
  it("links to the chat, or to Class when the teacher gave the mistake (its chat is hidden)", () => {
    expect(mistakeOrigin({ source: "ai", sessionId: "s1" })).toEqual({ href: "/chat/s1", label: "Open chat" });
    expect(mistakeOrigin({ source: "class", sessionId: "hidden" })).toEqual({ href: "/class", label: "Open class" });
  });
});

describe("class mistakes in the categories dictation can't measure", () => {
  const base = { severity: "moderate" as const, inputMode: "spoken" as const, discardedAt: null };

  it("count when the teacher gave them (they heard it), except spelling, punctuation and capitalization", () => {
    expect(countsInStats({ ...base, category: "prepositions", source: "class" }, false)).toBe(true);
    expect(countsInStats({ ...base, category: "articles", source: "class" }, false)).toBe(true);
    expect(countsInStats({ ...base, category: "spelling", source: "class" }, false)).toBe(false);
    expect(countsInStats({ ...base, category: "punctuation", source: "class" }, false)).toBe(false);
  });

  it("still don't count in dictated messages analyzed by the AI", () => {
    expect(countsInStats({ ...base, category: "prepositions", source: "ai" }, false)).toBe(false);
    expect(countsInStats({ ...base, category: "prepositions" }, false)).toBe(false);
  });
});
