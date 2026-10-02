import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { type CardKind, mistakeKey } from "@/lib/flashcards-core";
import { orphanReviewIds } from "@/lib/flashcards-upkeep-core";
import { DEFAULT_EASE } from "@/lib/srs";
import { getVocabulary } from "@/lib/vocabulary";
import { wordKey } from "@/lib/vocabulary-core";

/** Every correction, with the mistake card key it builds (whether or not it counts in the stats). */
function correctionKeys(): { id: string; key: string }[] {
  return db
    .select({ id: schema.corrections.id, original: schema.corrections.original, correction: schema.corrections.correction })
    .from(schema.corrections)
    .all()
    .map((r) => ({ id: r.id, key: mistakeKey(r.original, r.correction) }));
}

function vocabularyKeys(): { id: string; key: string }[] {
  return db
    .select({ id: schema.vocabulary.id, spanish: schema.vocabulary.spanish })
    .from(schema.vocabulary)
    .all()
    .map((r) => ({ id: r.id, key: wordKey(r.spanish) }));
}

function missedExerciseIds(): Set<string> {
  return new Set(
    db
      .select({ id: schema.missedExercises.id })
      .from(schema.missedExercises)
      .all()
      .map((r) => r.id),
  );
}

/**
 * Deletes the review state of cards that no longer exist: their word lookups
 * or corrections were deleted (with their chat, from the Vocabulary page, or
 * from a flashcard), or their missed exercise row is gone (exercise cards are
 * keyed by the `missed_exercises` id, so the match is exact). A key is kept
 * while any row (counted in the stats or not) still builds it. The review log
 * is history, so it stays. Returns how many rows went.
 */
export function cleanOrphanReviews(): number {
  const rows = db
    .select({ id: schema.reviews.id, kind: schema.reviews.kind, cardKey: schema.reviews.cardKey })
    .from(schema.reviews)
    .where(inArray(schema.reviews.kind, ["vocabulary", "mistake", "exercise"]))
    .all();
  if (rows.length === 0) return 0;
  const ids = orphanReviewIds(rows, {
    vocabulary: new Set(vocabularyKeys().map((r) => r.key)),
    mistake: new Set(correctionKeys().map((r) => r.key)),
    exercise: missedExerciseIds(),
  });
  if (ids.length > 0) db.delete(schema.reviews).where(inArray(schema.reviews.id, ids)).run();
  return ids.length;
}

const cardWhere = (kind: CardKind, key: string) =>
  and(eq(schema.reviews.kind, kind), eq(schema.reviews.cardKey, key));

/** Hides a card from its deck until it's unsuspended; its progress is kept. */
export function suspendCard(kind: CardKind, key: string) {
  const now = new Date();
  const row = db.select({ id: schema.reviews.id }).from(schema.reviews).where(cardWhere(kind, key)).get();
  if (row) {
    db.update(schema.reviews).set({ suspendedAt: now }).where(eq(schema.reviews.id, row.id)).run();
    return;
  }
  // Never reviewed: a placeholder row with no reviews, so it's still new when it comes back.
  db.insert(schema.reviews)
    .values({ id: crypto.randomUUID(), kind, cardKey: key, ease: DEFAULT_EASE, dueAt: now, reviewCount: 0, suspendedAt: now, createdAt: now })
    .run();
}

export function unsuspendCard(kind: CardKind, key: string) {
  const row = db.select().from(schema.reviews).where(cardWhere(kind, key)).get();
  if (!row) return;
  if (row.reviewCount === 0) db.delete(schema.reviews).where(eq(schema.reviews.id, row.id)).run();
  else db.update(schema.reviews).set({ suspendedAt: null }).where(eq(schema.reviews.id, row.id)).run();
}

/**
 * Deletes a card at its source: every lookup of the word, every correction
 * that makes the mistake (so it also stops counting in the stats), or the
 * missed exercise item (its chat stays). Returns how many rows were deleted;
 * the card's review state goes with them.
 */
export function deleteCard(kind: CardKind, key: string): number {
  if (kind === "exercise") {
    const deleted = db.delete(schema.missedExercises).where(eq(schema.missedExercises.id, key)).run().changes;
    db.delete(schema.reviews).where(cardWhere(kind, key)).run();
    return deleted;
  }
  const source = kind === "vocabulary" ? vocabularyKeys() : correctionKeys();
  const ids = source.filter((r) => r.key === key).map((r) => r.id);
  if (ids.length > 0) {
    const table = kind === "vocabulary" ? schema.vocabulary : schema.corrections;
    db.delete(table).where(inArray(table.id, ids)).run();
  }
  db.delete(schema.reviews).where(cardWhere(kind, key)).run();
  return ids.length;
}

export interface SuspendedCard {
  kind: CardKind;
  key: string;
  /** What the card asks ("aprovechar", or the mistake as written). */
  front: string;
  /** Its answer, when known. */
  back: string | null;
  suspendedAt: number;
}

/** Suspended cards of every deck, most recently suspended first. */
export function getSuspendedCards(): SuspendedCard[] {
  const rows = db
    .select({ kind: schema.reviews.kind, key: schema.reviews.cardKey, suspendedAt: schema.reviews.suspendedAt })
    .from(schema.reviews)
    .where(isNotNull(schema.reviews.suspendedAt))
    .all();
  if (rows.length === 0) return [];
  const words = rows.some((r) => r.kind === "vocabulary") ? new Map(getVocabulary().map((w) => [w.key, w])) : null;
  const exerciseKeys = rows.filter((r) => r.kind === "exercise").map((r) => r.key);
  const exercises = new Map(
    exerciseKeys.length > 0
      ? db
          .select({ id: schema.missedExercises.id, sentence: schema.missedExercises.sentence, answer: schema.missedExercises.answer })
          .from(schema.missedExercises)
          .where(inArray(schema.missedExercises.id, exerciseKeys))
          .all()
          .map((e) => [e.id, e])
      : [],
  );

  return rows
    .map((r): SuspendedCard => {
      const base = { kind: r.kind, key: r.key, suspendedAt: r.suspendedAt!.getTime() };
      if (r.kind === "vocabulary") {
        const word = words?.get(r.key);
        return { ...base, front: word?.spanish ?? r.key, back: word?.english.join(" / ") ?? null };
      }
      if (r.kind === "mistake") {
        const [front, back] = r.key.split(" → ");
        return { ...base, front, back: back ?? null };
      }
      const exercise = exercises.get(r.key);
      return { ...base, front: exercise?.sentence ?? r.key, back: exercise?.answer ?? null };
    })
    .sort((a, b) => b.suspendedAt - a.suspendedAt);
}
