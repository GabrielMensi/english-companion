import "server-only";

import { count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CorrectionSource } from "@/db/schema";
import { owned } from "@/db/owned";
import { toChatCorrection } from "@/lib/correction-review";
import { getSettings } from "@/lib/settings";
import { countsInStats } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { CorrectionUpdate } from "@/lib/types";

/**
 * The learner's own review of a stored correction. Only the correction row
 * changes: the saved analysis (corrected text, explanation...) is never
 * generated again.
 */

/** The correction as the routes return it, with whether it counts in the stats now. */
export function getCorrectionUpdate(userId: string, id: string): CorrectionUpdate | undefined {
  const row = db
    .select({ correction: schema.corrections, inputMode: schema.messages.inputMode })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id)))
    .get();
  if (!row) return undefined;
  return {
    correction: toChatCorrection(row.correction),
    countsInStats: countsInStats(
      { ...row.correction, inputMode: row.inputMode },
      getSettings(userId).countTyposInStats,
    ),
  };
}

/**
 * Discards a wrong correction: it's kept, but left out of every statistic until restored.
 * Discarding it again changes nothing (the first date and reason stay).
 */
export function discardCorrection(userId: string, id: string, reason: string | null): CorrectionUpdate | undefined {
  db.update(schema.corrections)
    .set({ discardedAt: new Date(), discardReason: reason })
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id), isNull(schema.corrections.discardedAt)))
    .run();
  return getCorrectionUpdate(userId, id);
}

/** Undoes a discard. */
export function restoreCorrection(userId: string, id: string): CorrectionUpdate | undefined {
  db.update(schema.corrections)
    .set({ discardedAt: null, discardReason: null })
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id)))
    .run();
  return getCorrectionUpdate(userId, id);
}

export const DISCARDED_LIMIT = 100;

export type DiscardedMistake = {
  id: string;
  original: string;
  correction: string;
  category: ErrorCategory;
  reason: string | null;
  discardedAt: Date;
  sessionId: string;
  /** "class" when the teacher gave it: its chat is hidden, so the page links to Class instead. */
  source: CorrectionSource;
};

/** The learner's discarded mistakes, newest discard first (at most `limit`), and how many there are in all. */
export function getDiscardedMistakes(
  userId: string,
  limit = DISCARDED_LIMIT,
): { items: DiscardedMistake[]; total: number } {
  const rows = db
    .select({
      id: schema.corrections.id,
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      category: schema.corrections.category,
      reason: schema.corrections.discardReason,
      discardedAt: schema.corrections.discardedAt,
      sessionId: schema.messages.sessionId,
      source: schema.corrections.source,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(owned(schema.corrections, userId, isNotNull(schema.corrections.discardedAt)))
    .orderBy(desc(schema.corrections.discardedAt))
    .limit(limit)
    .all();
  const total = countDiscardedMistakes(userId);
  return {
    items: rows.flatMap((r) => (r.discardedAt ? [{ ...r, discardedAt: r.discardedAt }] : [])),
    total,
  };
}

/** How many mistakes the learner has discarded. */
export function countDiscardedMistakes(userId: string): number {
  return (
    db
      .select({ n: count() })
      .from(schema.corrections)
      .where(owned(schema.corrections, userId, isNotNull(schema.corrections.discardedAt)))
      .get()?.n ?? 0
  );
}
