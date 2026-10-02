import { describe, expect, it } from "vitest";
import { computeReviewStats, dueForecast, type LoggedReview } from "./review-stats-core";
import type { Grade, ReviewState } from "./srs";

/** Local time on 2026-10-<day> at <hour>:00. */
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
const NOW = at(10, 18);

function review(day: number, grade: Grade = "good", wasNew = false, hour = 12): LoggedReview {
  return { grade, reviewedAt: at(day, hour), wasNew };
}

describe("computeReviewStats", () => {
  it("is empty without a log", () => {
    const stats = computeReviewStats({ log: [], from: null, now: NOW });
    expect(stats).toMatchObject({ total: 0, retention: null, matureRetention: null, perDay: 0, since: null });
    expect(stats.timeline).toEqual([]);
    expect(stats.streak).toEqual({ current: 0, best: 0, reviewedToday: false });
  });

  it("computes retention as the share of reviews not graded Again", () => {
    const log = [review(10, "good"), review(10, "again"), review(10, "hard", true), review(10, "easy")];
    const stats = computeReviewStats({ log, from: null, now: NOW });
    expect(stats.total).toBe(4);
    expect(stats.retention).toBe(75);
    // First reviews of new cards are left out of the mature retention.
    expect(stats.matureRetention).toBeCloseTo((2 / 3) * 100);
  });

  it("only counts reviews in the period", () => {
    const log = [review(1, "again"), review(9), review(10)];
    const stats = computeReviewStats({ log, from: at(8, 0), now: NOW });
    expect(stats.total).toBe(2);
    expect(stats.retention).toBe(100);
  });

  it("averages reviews per day from when the log starts, not before", () => {
    // The period is 30 days, but the log only starts on day 8: 3 calendar days (8, 9, 10).
    const log = [review(8), review(8), review(10), review(10), review(10), review(10)];
    const stats = computeReviewStats({ log, from: NOW - 30 * 86_400_000, now: NOW });
    expect(stats.perDay).toBe(2);
    expect(stats.activeDays).toBe(2);
    expect(stats.timeline.map((p) => [p.bucket, p.reviews])).toEqual([
      ["2026-10-08", 2],
      ["2026-10-09", 0],
      ["2026-10-10", 4],
    ]);
  });

  it("counts Again answers per bucket", () => {
    const stats = computeReviewStats({ log: [review(10, "again"), review(10)], from: null, now: NOW });
    expect(stats.timeline).toEqual([{ bucket: "2026-10-10", reviews: 2, again: 1 }]);
  });

  it("uses weekly buckets for long periods", () => {
    const log = [review(1), { grade: "good" as const, reviewedAt: new Date(2026, 7, 1, 12).getTime(), wasNew: true }];
    const stats = computeReviewStats({ log, from: null, now: NOW });
    expect(stats.timeline.length).toBeLessThan(15);
    expect(stats.timeline.reduce((n, p) => n + p.reviews, 0)).toBe(2);
  });

  describe("streak", () => {
    it("counts consecutive days up to today", () => {
      const log = [review(7), review(8), review(9), review(10, "again")];
      expect(computeReviewStats({ log, from: null, now: NOW }).streak).toEqual({
        current: 4,
        best: 4,
        reviewedToday: true,
      });
    });

    it("keeps the streak alive until today is over", () => {
      const log = [review(8), review(9)];
      expect(computeReviewStats({ log, from: null, now: NOW }).streak).toEqual({
        current: 2,
        best: 2,
        reviewedToday: false,
      });
    });

    it("breaks after a day without reviews, remembering the best run", () => {
      const log = [review(2), review(3), review(4), review(8), review(10, "good", false, 0)];
      expect(computeReviewStats({ log, from: null, now: NOW }).streak).toEqual({
        current: 1,
        best: 3,
        reviewedToday: true,
      });
    });

    it("ignores the period filter", () => {
      const log = [review(8), review(9), review(10)];
      expect(computeReviewStats({ log, from: at(10, 0), now: NOW }).streak.current).toBe(3);
    });

    it("uses local calendar days, not 24-hour windows", () => {
      // 23:00 and 01:00 the next day are two different days, two hours apart.
      const log = [review(9, "good", false, 23), review(10, "good", false, 1)];
      expect(computeReviewStats({ log, from: null, now: NOW }).streak.current).toBe(2);
    });
  });
});

describe("dueForecast", () => {
  const state = (dueAt: number): ReviewState => ({ ease: 2.5, intervalDays: 1, repetitions: 1, lapses: 0, dueAt });

  it("splits cards into due now, new and upcoming", () => {
    const forecast = dueForecast(
      [null, null, state(NOW - 1000), state(NOW), state(at(10, 22)), state(at(11, 9)), state(at(14)), state(at(30))],
      NOW,
    );
    expect(forecast).toEqual({ dueNow: 2, newCards: 2, laterToday: 1, tomorrow: 1, nextWeek: 3 });
  });
});
