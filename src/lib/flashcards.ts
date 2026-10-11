import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
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
import { categoryLabel, countsInStats, subtypeLabel, TENSE_LABELS, TENSES } from "@/lib/taxonomy";
import { getVocabulary } from "@/lib/vocabulary";

/**
 * Review state of each card of a deck, by card key. A null state means the
 * card is new (a row created only to suspend it). Suspended cards are listed
 * apart, so the decks can leave them out.
 */
function loadStates(kind: CardKind): { states: Map<string, ReviewState | null>; suspended: Set<string> } {
  const rows = db.select().from(schema.reviews).where(eq(schema.reviews.kind, kind)).all();
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
function withStates<C extends Card>(cards: C[], kind: CardKind): QueuedCard<C>[] {
  const { states, suspended } = loadStates(kind);
  return cards
    .filter((card) => !suspended.has(card.key))
    .map((card) => ({ card, state: states.get(card.key) ?? null }));
}

/** Every real mistake (the ones that count in the stats) as a card, newest first. */
function loadMistakeCards(): MistakeCard[] {
  const { countTyposInStats } = getSettings();
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
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.corrections.messageId))
    .all();

  return mistakeCards(
    rows
      .filter((r) => countsInStats(r, countTyposInStats))
      .map(({ createdAt, ...r }) => ({ ...r, createdAt: createdAt.getTime() })),
  );
}

export function getVocabularyDeck(): QueuedCard<VocabularyCard>[] {
  return withStates(vocabularyCards(getVocabulary()), "vocabulary");
}

export function getMistakeDeck(filter: MistakeFilter = {}): QueuedCard<MistakeCard>[] {
  return withStates(filterMistakes(loadMistakeCards(), filter), "mistake");
}

/** Exercise items missed in Practice, newest first. */
export function getExerciseDeck(): QueuedCard<ExerciseCard>[] {
  return withStates(loadExerciseCards(), "exercise");
}

/** Sentences read aloud with words heard differently, newest first. */
export function getPronunciationDeck(): QueuedCard<PronunciationCard>[] {
  return withStates(loadPronunciationCards(), "pronunciation");
}

export interface FilterOption {
  filter: MistakeFilter;
  label: string;
  /** Cards to study now (due + new). */
  toStudy: number;
  total: number;
}

/** Cards to study now across the decks, for the sidebar badge. Read-only, unlike the overview. */
export function countCardsToStudy(): number {
  const now = Date.now();
  const { newCardsPerSession } = getSettings();
  return [getVocabularyDeck(), withStates(loadMistakeCards(), "mistake"), getExerciseDeck(), getPronunciationDeck()]
    .map((deck) => deckCounts(deck, now))
    .reduce((sum, c) => sum + c.due + Math.min(c.new, newCardsPerSession), 0);
}

/** Overview of both decks, plus the tenses and error types the mistake deck can be narrowed to. */
export function getFlashcardsOverview() {
  cleanOrphanReviews();
  const now = Date.now();
  const { newCardsPerSession: newLimit } = getSettings();
  const mistakes = withStates(loadMistakeCards(), "mistake");

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
    vocabulary: deckCounts(getVocabularyDeck(), now),
    mistakes: deckCounts(mistakes, now),
    exercises: deckCounts(getExerciseDeck(), now),
    pronunciation: deckCounts(getPronunciationDeck(), now),
    tenses,
    categories,
  };
}

export function getStudyQueue(kind: CardKind, filter: MistakeFilter = {}): QueuedCard[] {
  const now = Date.now();
  const { newCardsPerSession } = getSettings();
  if (kind === "exercise") return buildQueue(getExerciseDeck(), now, newCardsPerSession);
  if (kind === "pronunciation") return buildQueue(getPronunciationDeck(), now, newCardsPerSession);
  return kind === "vocabulary"
    ? buildQueue(getVocabularyDeck(), now, newCardsPerSession)
    : buildQueue(getMistakeDeck(filter), now, newCardsPerSession);
}

/** Stores the learner's grade for a card and returns its new state. */
export function recordReview(kind: CardKind, cardKey: string, grade: Grade): ReviewState {
  const now = Date.now();
  const where = and(eq(schema.reviews.kind, kind), eq(schema.reviews.cardKey, cardKey));
  const row = db.select().from(schema.reviews).where(where).get();
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
      .where(eq(schema.reviews.id, row.id))
      .run();
  } else {
    db.insert(schema.reviews)
      .values({ id: crypto.randomUUID(), kind, cardKey, reviewCount: 1, createdAt: new Date(now), ...values })
      .run();
  }
  db.insert(schema.reviewLog)
    .values({
      id: crypto.randomUUID(),
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
