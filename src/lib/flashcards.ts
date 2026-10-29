import "server-only";

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import {
  buildQueue,
  type Card,
  type CardKind,
  deckCounts,
  type ExerciseCard,
  filterMistakes,
  matchesFilter,
  type MistakeCard,
  mistakeCards,
  type MistakeFilter,
  type PronunciationCard,
  type QueuedCard,
  type VocabularyCard,
  vocabularyCards,
} from "@/lib/flashcards-core";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { loadExerciseCards } from "@/lib/missed-exercises";
import { loadPronunciationCards } from "@/lib/read-aloud";
import { getSettings } from "@/lib/settings";
import { type Grade, newReviewState, type ReviewState, schedule } from "@/lib/srs";
import { categoryLabel, countsInStats, TENSE_LABELS, TENSES } from "@/lib/taxonomy";
import { subtypeLabel } from "@/lib/subtypes";
import { getVocabulary } from "@/lib/vocabulary";

/**
 * Review state of each card of a deck, by card key. A null state means the
 * card is new (a row created only to suspend it). Suspended cards are listed
 * apart, so the decks can leave them out.
 */
function loadStates(
  userId: string,
  kind: CardKind,
): { states: Map<string, ReviewState | null>; suspended: Set<string> } {
  const rows = db
    .select()
    .from(schema.reviews)
    .where(owned(schema.reviews, userId, eq(schema.reviews.kind, kind)))
    .all();
  return {
    states: new Map(rows.map((r) => [r.cardKey, r.reviewCount > 0 ? toState(r) : null])),
    suspended: new Set(rows.filter((r) => r.suspendedAt !== null).map((r) => r.cardKey)),
  };
}

function toState(r: typeof schema.reviews.$inferSelect): ReviewState {
  return {
    ease: r.ease,
    intervalDays: r.intervalDays,
    repetitions: r.repetitions,
    lapses: r.lapses,
    dueAt: r.dueAt.getTime(),
  };
}

/** The deck's cards with their review state; suspended cards are left out. */
function withStates<C extends Card>(userId: string, cards: C[], kind: CardKind): QueuedCard<C>[] {
  const { states, suspended } = loadStates(userId, kind);
  return cards
    .filter((card) => !suspended.has(card.key))
    .map((card) => ({ card, state: states.get(card.key) ?? null }));
}

/** Every real mistake (the ones that count in the stats) as a card, newest first. */
function loadMistakeCards(userId: string): MistakeCard[] {
  const { countTyposInStats } = getSettings(userId);
  const rows = db
    .select({
      id: schema.corrections.id,
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      explanation: schema.corrections.explanation,
      category: schema.corrections.category,
      subtype: schema.corrections.subtype,
      tense: schema.corrections.tense,
      severity: schema.corrections.severity,
      createdAt: schema.corrections.createdAt,
      sessionId: schema.messages.sessionId,
      sentence: schema.messages.content,
      inputMode: schema.messages.inputMode,
      discardedAt: schema.corrections.discardedAt,
      source: schema.corrections.source,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.corrections.messageId))
    .where(owned(schema.corrections, userId))
    .all();

  return mistakeCards(
    rows
      .filter((r) => countsInStats(r, countTyposInStats))
      .map(({ createdAt, ...r }) => ({ ...r, createdAt: createdAt.getTime() })),
  );
}

export function getVocabularyDeck(userId: string): QueuedCard<VocabularyCard>[] {
  return withStates(userId, vocabularyCards(getVocabulary(userId)), "vocabulary");
}

export function getMistakeDeck(userId: string, filter: MistakeFilter = {}): QueuedCard<MistakeCard>[] {
  return withStates(userId, filterMistakes(loadMistakeCards(userId), filter), "mistake");
}

/** Exercise items missed in Practice, newest first. */
export function getExerciseDeck(userId: string): QueuedCard<ExerciseCard>[] {
  return withStates(userId, loadExerciseCards(userId), "exercise");
}

/** Sentences read aloud with words heard differently, newest first. */
export function getPronunciationDeck(userId: string): QueuedCard<PronunciationCard>[] {
  return withStates(userId, loadPronunciationCards(userId), "pronunciation");
}

export interface FilterOption {
  filter: MistakeFilter;
  label: string;
  /** Cards to study now (due + new). */
  toStudy: number;
  total: number;
}

/** Cards to study now across the decks, for the sidebar badge. Read-only, unlike the overview. */
export function countCardsToStudy(userId: string): number {
  const now = Date.now();
  const { newCardsPerSession } = getSettings(userId);
  return [
    getVocabularyDeck(userId),
    withStates(userId, loadMistakeCards(userId), "mistake"),
    getExerciseDeck(userId),
    getPronunciationDeck(userId),
  ]
    .map((deck) => deckCounts(deck, now))
    .reduce((sum, c) => sum + c.due + Math.min(c.new, newCardsPerSession), 0);
}

/** Overview of both decks, plus the tenses and error types the mistake deck can be narrowed to. */
export function getFlashcardsOverview(userId: string) {
  cleanOrphanReviews(userId);
  const now = Date.now();
  const { newCardsPerSession: newLimit } = getSettings(userId);
  const mistakes = withStates(userId, loadMistakeCards(userId), "mistake");

  const option = (filter: MistakeFilter, label: string): FilterOption => {
    const counts = deckCounts(
      mistakes.filter((c) => matchesFilter(c.card, filter)),
      now,
    );
    return { filter, label, toStudy: counts.due + Math.min(counts.new, newLimit), total: counts.total };
  };

  const present = <T>(values: T[]) => [...new Set(values)];
  const cards = mistakes.map((c) => c.card);

  const tenses = TENSES.filter((t) => cards.some((c) => c.tense === t)).map((t) =>
    option({ tense: t }, TENSE_LABELS[t]),
  );

  const categories = present(cards.map((c) => c.category))
    .map((category) => ({
      ...option({ category }, categoryLabel(category)),
      subtypes: present(cards.filter((c) => c.category === category && c.subtype).map((c) => c.subtype as string))
        .map((subtype) => option({ category, subtype }, subtypeLabel(category, subtype) ?? subtype))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    now,
    /** New cards a study session adds (a setting). */
    newLimit,
    vocabulary: deckCounts(getVocabularyDeck(userId), now),
    mistakes: deckCounts(mistakes, now),
    exercises: deckCounts(getExerciseDeck(userId), now),
    pronunciation: deckCounts(getPronunciationDeck(userId), now),
    tenses,
    categories,
  };
}

export function getStudyQueue(userId: string, kind: CardKind, filter: MistakeFilter = {}): QueuedCard[] {
  const now = Date.now();
  const { newCardsPerSession } = getSettings(userId);
  if (kind === "exercise") return buildQueue(getExerciseDeck(userId), now, newCardsPerSession);
  if (kind === "pronunciation") return buildQueue(getPronunciationDeck(userId), now, newCardsPerSession);
  return kind === "vocabulary"
    ? buildQueue(getVocabularyDeck(userId), now, newCardsPerSession)
    : buildQueue(getMistakeDeck(userId, filter), now, newCardsPerSession);
}

/** Stores the learner's grade for a card and returns its new state. */
export function recordReview(userId: string, kind: CardKind, cardKey: string, grade: Grade): ReviewState {
  const now = Date.now();
  const row = db
    .select()
    .from(schema.reviews)
    .where(owned(schema.reviews, userId, eq(schema.reviews.kind, kind), eq(schema.reviews.cardKey, cardKey)))
    .get();
  // A row with no reviews was only created to suspend the card: it's still new.
  const previous: ReviewState = row && row.reviewCount > 0 ? toState(row) : newReviewState(now);
  const next = schedule(previous, grade, now);
  const values = {
    ease: next.ease,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    lapses: next.lapses,
    dueAt: new Date(next.dueAt),
    lastGrade: grade,
    lastReviewedAt: new Date(now),
  };

  if (row) {
    db.update(schema.reviews)
      .set({ ...values, reviewCount: row.reviewCount + 1 })
      .where(owned(schema.reviews, userId, eq(schema.reviews.id, row.id)))
      .run();
  } else {
    db.insert(schema.reviews)
      .values({ id: crypto.randomUUID(), userId, kind, cardKey, reviewCount: 1, createdAt: new Date(now), ...values })
      .run();
  }
  db.insert(schema.reviewLog)
    .values({
      id: crypto.randomUUID(),
      userId,
      kind,
      cardKey,
      grade,
      wasNew: !row || row.reviewCount === 0,
      intervalDays: next.intervalDays,
      reviewedAt: new Date(now),
    })
    .run();
  return next;
}

export type FlashcardsOverview = ReturnType<typeof getFlashcardsOverview>;
