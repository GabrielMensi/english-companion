import { describe, expect, it } from "vitest";
import {
  DEFAULT_EASE,
  formatDelay,
  MIN_EASE,
  newReviewState,
  nextEase,
  previewIntervals,
  RELEARN_DELAY_MS,
  type ReviewState,
  schedule,
} from "./srs";

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;

function days(state: ReviewState, now = NOW) {
  return (state.dueAt - now) / DAY;
}

describe("nextEase", () => {
  it("follows SM-2: good keeps the ease, easy raises it, hard and again lower it", () => {
    expect(nextEase(2.5, "good")).toBe(2.5);
    expect(nextEase(2.5, "easy")).toBe(2.6);
    expect(nextEase(2.5, "hard")).toBe(2.36);
    expect(nextEase(2.5, "again")).toBe(1.96);
  });

  it("never goes below the minimum", () => {
    expect(nextEase(1.4, "again")).toBe(MIN_EASE);
  });
});

describe("schedule", () => {
  it("starts new cards with 1 day, then 6 days, then interval × ease", () => {
    let s = newReviewState(NOW);
    expect(s.ease).toBe(DEFAULT_EASE);
    s = schedule(s, "good", NOW);
    expect(s.intervalDays).toBe(1);
    expect(days(s)).toBe(1);
    s = schedule(s, "good", NOW);
    expect(s.intervalDays).toBe(6);
    s = schedule(s, "good", NOW);
    expect(s.intervalDays).toBe(15);
    expect(s.repetitions).toBe(3);
  });

  it("gives easy cards longer intervals and hard cards shorter ones", () => {
    const learned: ReviewState = { ease: 2.5, intervalDays: 10, repetitions: 3, lapses: 0, dueAt: NOW };
    const hard = schedule(learned, "hard", NOW).intervalDays;
    const good = schedule(learned, "good", NOW).intervalDays;
    const easy = schedule(learned, "easy", NOW).intervalDays;
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
    expect(schedule(newReviewState(NOW), "easy", NOW).intervalDays).toBe(4);
  });

  it("always moves a learned card forward at least one day", () => {
    const s: ReviewState = { ease: 1.3, intervalDays: 1, repetitions: 2, lapses: 0, dueAt: NOW };
    expect(schedule(s, "hard", NOW).intervalDays).toBe(2);
  });

  it("resets a forgotten card, counts the lapse and brings it back in minutes", () => {
    const learned: ReviewState = { ease: 2.5, intervalDays: 20, repetitions: 4, lapses: 1, dueAt: NOW };
    const s = schedule(learned, "again", NOW);
    expect(s).toEqual({ ease: 1.96, intervalDays: 0, repetitions: 0, lapses: 2, dueAt: NOW + RELEARN_DELAY_MS });
    // Failing a card that was never learned isn't a lapse.
    expect(schedule(newReviewState(NOW), "again", NOW).lapses).toBe(0);
  });
});

describe("previewIntervals", () => {
  it("shows what each button would do", () => {
    const p = previewIntervals(newReviewState(NOW), NOW);
    expect(p).toEqual({ again: RELEARN_DELAY_MS, hard: DAY, good: DAY, easy: 4 * DAY });
  });
});

describe("formatDelay", () => {
  it("uses the largest sensible unit", () => {
    expect(formatDelay(10 * 60_000)).toBe("10 min");
    expect(formatDelay(3 * 3_600_000)).toBe("3 h");
    expect(formatDelay(DAY)).toBe("1 day");
    expect(formatDelay(6 * DAY)).toBe("6 days");
    expect(formatDelay(21 * DAY)).toBe("3 weeks");
    expect(formatDelay(90 * DAY)).toBe("3 months");
    expect(formatDelay(365 * DAY)).toBe("1 year");
  });
});
