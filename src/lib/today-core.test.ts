import { describe, expect, it } from "vitest";
import { greeting, todaySummary, weekSummary } from "@/lib/today-core";

describe("greeting", () => {
  it("follows the time of day", () => {
    expect([2, 8, 15, 21].map(greeting)).toEqual(["Good evening", "Good morning", "Good afternoon", "Good evening"]);
  });
});

describe("todaySummary", () => {
  it("joins cards and the focus", () => {
    expect(todaySummary({ cardsToStudy: 21, focus: "past simple needs work", wroteThisWeek: true })).toBe(
      "21 cards to study, and past simple needs work.",
    );
    expect(todaySummary({ cardsToStudy: 1, focus: null, wroteThisWeek: true })).toBe("1 card to study.");
    expect(todaySummary({ cardsToStudy: 0, focus: "past simple needs work", wroteThisWeek: true })).toBe(
      "Past simple needs work.",
    );
  });

  it("points at writing when there's nothing to do", () => {
    expect(todaySummary({ cardsToStudy: 0, focus: null, wroteThisWeek: true })).toBe(
      "Nothing due. Write something new.",
    );
    expect(todaySummary({ cardsToStudy: 0, focus: null, wroteThisWeek: false })).toBe(
      "Nothing written this week yet. Start with a chat.",
    );
  });
});

describe("weekSummary", () => {
  const totals = { messages: 30, words: 1322, per100Words: 7.19, previousPer100Words: 4.72 };

  it("compares with the week before", () => {
    expect(weekSummary(totals)).toBe(
      "30 messages, 1,322 words and 7.19 mistakes per 100 words, 2.47 more than the week before.",
    );
    expect(weekSummary({ ...totals, previousPer100Words: 8.2 })).toBe(
      "30 messages, 1,322 words and 7.19 mistakes per 100 words, 1.01 fewer than the week before.",
    );
    expect(weekSummary({ ...totals, previousPer100Words: 7.19 })).toContain("the same as the week before");
  });

  it("leaves the comparison out without a previous week", () => {
    expect(weekSummary({ messages: 1, words: 40, per100Words: 0, previousPer100Words: null })).toBe(
      "1 message, 40 words and 0 mistakes per 100 words.",
    );
  });
});
