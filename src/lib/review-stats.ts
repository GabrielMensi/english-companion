import "server-only";

import { and, gt, isNotNull, min } from "drizzle-orm";
import { db, schema } from "@/db";
import { getExerciseDeck, getMistakeDeck, getVocabularyDeck } from "@/lib/flashcards";
import { computeReviewStats, dueForecast } from "@/lib/review-stats-core";
import { RANGES, type RangeKey } from "@/lib/stats";

const DAY = 86_400_000;

/** Flashcard review stats for the dashboard, for the selected period. */
export function getReviewDashboard(range: RangeKey) {
  const now = Date.now();
  const days = RANGES[range];
  const from = days === null ? null : now - days * DAY;

  const log = db
    .select({ grade: schema.reviewLog.grade, reviewedAt: schema.reviewLog.reviewedAt, wasNew: schema.reviewLog.wasNew })
    .from(schema.reviewLog)
    .all()
    .map((r) => ({ ...r, reviewedAt: r.reviewedAt.getTime() }));
  const stats = computeReviewStats({ log, from, now });

  // Active cards of every deck (suspended ones are already left out).
  const cards = [...getVocabularyDeck(), ...getMistakeDeck(), ...getExerciseDeck()];
  const due = dueForecast(
    cards.map((c) => c.state),
    now,
  );

  // Cards reviewed before the log existed: their history isn't in the stats.
  const firstReview = db
    .select({ at: min(schema.reviews.createdAt) })
    .from(schema.reviews)
    .where(and(gt(schema.reviews.reviewCount, 0), isNotNull(schema.reviews.lastReviewedAt)))
    .get()?.at;
  const untrackedBefore = firstReview != null && firstReview.getTime() < (stats.since ?? now);

  return { stats, due, totalCards: cards.length, untrackedBefore };
}

export type ReviewDashboard = ReturnType<typeof getReviewDashboard>;
