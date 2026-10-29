import "server-only";

import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { toChatCorrection } from "@/lib/correction-review";
import { getSettings } from "@/lib/settings";
import { countsInStats } from "@/lib/taxonomy";
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
