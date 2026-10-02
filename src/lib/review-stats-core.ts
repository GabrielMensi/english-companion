/**
 * Pure flashcard review stats for the dashboard: retention, reviews per day,
 * streak (from the `review_log` table) and what's coming due (from the
 * review state of each card). Days are local calendar days.
 */

import type { Grade, ReviewState } from "@/lib/srs";
import { bucketKey } from "@/lib/stats-core";

const DAY = 86_400_000;

export interface LoggedReview {
  grade: Grade;
  reviewedAt: number;
  wasNew: boolean;
}

export interface ReviewTimelinePoint {
  /** YYYY-MM-DD (the week's Monday for weekly buckets). */
  bucket: string;
  reviews: number;
  /** Answers graded Again. */
  again: number;
}

export interface ReviewStats {
  /** Reviews in the period. */
  total: number;
  /** Share of reviews in the period not graded Again, 0–100; null without reviews. */
  retention: number | null;
  /** The same, only for cards seen before (first reviews of new cards left out). */
  matureRetention: number | null;
  /** Average reviews per calendar day in the period (counted from when the log starts). */
  perDay: number;
  /** Days of the period with at least one review. */
  activeDays: number;
  timeline: ReviewTimelinePoint[];
  streak: {
    /** Days in a row with reviews, up to today (or up to yesterday while today has none yet). */
    current: number;
    best: number;
    reviewedToday: boolean;
  };
  /** First logged review ever: the history starts there. */
  since: number | null;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The local day after `ms`'s day (DST-safe: steps by calendar date, not 24 h). */
function nextDay(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

function previousDay(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : (part / whole) * 100;
}

function streaks(log: LoggedReview[], now: number): ReviewStats["streak"] {
  const days = new Set(log.map((r) => bucketKey(r.reviewedAt, false)));
  const today = bucketKey(now, false);
  const reviewedToday = days.has(today);

  let current = 0;
  let cursor = reviewedToday ? now : previousDay(now);
  while (days.has(bucketKey(cursor, false))) {
    current++;
    cursor = previousDay(cursor);
  }

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  const sorted = [...new Set(log.map((r) => startOfDay(r.reviewedAt)))].sort((a, b) => a - b);
  for (const day of sorted) {
    run = previous !== null && bucketKey(day, false) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = bucketKey(nextDay(day), false);
  }
  return { current, best: Math.max(best, current), reviewedToday };
}

/**
 * Stats for the reviews logged from `from` (null = all) to `now`. The streak
 * always looks at the whole log.
 */
export function computeReviewStats(input: { log: LoggedReview[]; from: number | null; now: number }): ReviewStats {
  const { log, from, now } = input;
  const since = log.length > 0 ? Math.min(...log.map((r) => r.reviewedAt)) : null;
  const inPeriod = log.filter((r) => (from === null || r.reviewedAt >= from) && r.reviewedAt <= now);

  const total = inPeriod.length;
  const remembered = inPeriod.filter((r) => r.grade !== "again").length;
  const seenBefore = inPeriod.filter((r) => !r.wasNew);
  const rememberedBefore = seenBefore.filter((r) => r.grade !== "again").length;

  // The period starts when the log does, if that's later: days before it weren't recorded.
  const start = since === null ? null : Math.max(from ?? since, since);
  let calendarDays = 0;
  if (start !== null) {
    for (let t = startOfDay(start); t <= now; t = nextDay(t)) calendarDays++;
  }

  const timeline: ReviewTimelinePoint[] = [];
  if (start !== null) {
    const weekly = (now - start) / DAY > 45;
    const buckets = new Map<string, ReviewTimelinePoint>();
    // Pre-fill so days without reviews show as zero.
    for (let t = startOfDay(start); t <= now; t = nextDay(t)) {
      const bucket = bucketKey(t, weekly);
      if (!buckets.has(bucket)) buckets.set(bucket, { bucket, reviews: 0, again: 0 });
    }
    for (const r of inPeriod) {
      const bucket = bucketKey(r.reviewedAt, weekly);
      const point = buckets.get(bucket) ?? { bucket, reviews: 0, again: 0 };
      point.reviews++;
      if (r.grade === "again") point.again++;
      buckets.set(bucket, point);
    }
    timeline.push(...[...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)));
  }

  return {
    total,
    retention: pct(remembered, total),
    matureRetention: pct(rememberedBefore, seenBefore.length),
    perDay: calendarDays === 0 ? 0 : total / calendarDays,
    activeDays: new Set(inPeriod.map((r) => bucketKey(r.reviewedAt, false))).size,
    timeline,
    streak: streaks(log, now),
    since,
  };
}

export interface DueForecast {
  /** Reviewed cards due now. */
  dueNow: number;
  /** Never reviewed, waiting to be studied. */
  newCards: number;
  /** Not due yet, but due before the end of today. */
  laterToday: number;
  /** Due tomorrow. */
  tomorrow: number;
  /** Not due now, but due within the next 7 days (includes later today and tomorrow). */
  nextWeek: number;
}

/** What's coming due, from each active card's review state (null = new card). */
export function dueForecast(states: (ReviewState | null)[], now: number): DueForecast {
  const endOfToday = nextDay(now);
  const endOfTomorrow = nextDay(endOfToday);
  const forecast: DueForecast = { dueNow: 0, newCards: 0, laterToday: 0, tomorrow: 0, nextWeek: 0 };
  for (const state of states) {
    if (!state) forecast.newCards++;
    else if (state.dueAt <= now) forecast.dueNow++;
    else {
      if (state.dueAt < endOfToday) forecast.laterToday++;
      else if (state.dueAt < endOfTomorrow) forecast.tomorrow++;
      if (state.dueAt <= now + 7 * DAY) forecast.nextWeek++;
    }
  }
  return forecast;
}
