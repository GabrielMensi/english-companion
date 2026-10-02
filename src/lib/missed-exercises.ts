import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acceptedAnswers } from "@/lib/category-practice";
import type { ExerciseCard } from "@/lib/flashcards-core";
import type { ExerciseTurn } from "@/lib/practice";

/**
 * Saves or clears the result of an exercise answer: a missed item is kept for
 * spaced review (the "Missed exercises" flashcard deck); answering it right on
 * a retry removes it, with its review state.
 */
export function recordExerciseResult(sessionId: string, turn: ExerciseTurn) {
  const where = and(
    eq(schema.missedExercises.sessionId, sessionId),
    eq(schema.missedExercises.itemIndex, turn.index),
  );
  if (turn.missed) {
    db.insert(schema.missedExercises)
      .values({ id: crypto.randomUUID(), sessionId, itemIndex: turn.index, ...turn.missed })
      .onConflictDoUpdate({
        target: [schema.missedExercises.sessionId, schema.missedExercises.itemIndex],
        set: turn.missed,
      })
      .run();
    return;
  }
  const row = db.select({ id: schema.missedExercises.id }).from(schema.missedExercises).where(where).get();
  if (!row) return;
  db.transaction((tx) => {
    tx.delete(schema.missedExercises).where(eq(schema.missedExercises.id, row.id)).run();
    tx.delete(schema.reviews)
      .where(and(eq(schema.reviews.kind, "exercise"), eq(schema.reviews.cardKey, row.id)))
      .run();
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
