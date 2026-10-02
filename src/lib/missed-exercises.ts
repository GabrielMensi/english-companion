import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acceptedAnswers } from "@/lib/category-practice";
import type { ExerciseCard } from "@/lib/flashcards-core";
import type { ExerciseTurn } from "@/lib/practice";

/**
 * Saves or clears the result of each graded item: a missed item is kept for
 * spaced review (the "Missed exercises" flashcard deck), one row per item of
 * the chat; an item that is right, can't be checked or isn't answered on a
 * retry loses its row, with its review state.
 */
export function recordExerciseResult(sessionId: string, turn: ExerciseTurn) {
  db.transaction((tx) => {
    for (const { index, missed } of turn.outcomes) {
      if (missed) {
        tx.insert(schema.missedExercises)
          .values({ id: crypto.randomUUID(), sessionId, itemIndex: index, ...missed })
          .onConflictDoUpdate({
            target: [schema.missedExercises.sessionId, schema.missedExercises.itemIndex],
            set: missed,
          })
          .run();
        continue;
      }
      const row = tx
        .select({ id: schema.missedExercises.id })
        .from(schema.missedExercises)
        .where(and(eq(schema.missedExercises.sessionId, sessionId), eq(schema.missedExercises.itemIndex, index)))
        .get();
      if (!row) continue;
      tx.delete(schema.missedExercises).where(eq(schema.missedExercises.id, row.id)).run();
      tx.delete(schema.reviews)
        .where(and(eq(schema.reviews.kind, "exercise"), eq(schema.reviews.cardKey, row.id)))
        .run();
    }
  });
}

/** Every missed exercise item as a card, newest first. */
export function loadExerciseCards(): ExerciseCard[] {
  return db
    .select()
    .from(schema.missedExercises)
    .orderBy(desc(schema.missedExercises.createdAt), asc(schema.missedExercises.itemIndex))
    .all()
    .map((row) => ({
      kind: "exercise",
      key: row.id,
      sentence: row.sentence,
      answer: row.answer,
      why: row.why,
      learnerAnswer: row.learnerAnswer,
      topic: row.topic,
      accepted: acceptedAnswers(row),
      sessionId: row.sessionId,
      missedAt: row.createdAt.getTime(),
    }));
}
