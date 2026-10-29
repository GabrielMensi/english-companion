import "server-only";

import { gt, isNotNull, min } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { getExerciseDeck, getMistakeDeck, getVocabularyDeck } from "@/lib/flashcards";
import { computeReviewStats, dueForecast } from "@/lib/review-stats-core";
import { RANGES, type RangeKey } from "@/lib/stats";

const DAY = 86_400_000;

/** Flashcard review stats for the dashboard, for the selected period. */
export function getReviewDashboard(userId: string, range: RangeKey) {
  const now = Date.now();
  const days = RANGES[range];
  const from = days === null ? null : now - days * DAY;

  const log = db
    .select({ grade: schema.reviewLog.grade, reviewedAt: schema.reviewLog.reviewedAt, wasNew: schema.reviewLog.wasNew })
    .from(schema.reviewLog)
    .where(owned(schema.reviewLog, userId))
    .all()
    .map((r) => ({ ...r, reviewedAt: r.reviewedAt.getTime() }));
  const stats = computeReviewStats({ log, from, now });

  // Active cards of every deck (suspended ones are already left out).
  const cards = [...getVocabularyDeck(userId), ...getMistakeDeck(userId), ...getExerciseDeck(userId)];
  const due = dueForecast(
    cards.map((c) => c.state),
    now,
  );

  // Cards reviewed before the log existed: their history isn't in the stats.
  const firstReview = db
    .select({ at: min(schema.reviews.createdAt) })
    .from(schema.reviews)
    .where(owned(schema.reviews, userId, gt(schema.reviews.reviewCount, 0), isNotNull(schema.reviews.lastReviewedAt)))
    .get()?.at;
  const untrackedBefore = firstReview != null && firstReview.getTime() < (stats.since ?? now);

  return { stats, due, totalCards: cards.length, untrackedBefore };
}

export type ReviewDashboard = ReturnType<typeof getReviewDashboard>;
