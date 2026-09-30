import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  buildQueue,
  type Card,
  type CardKind,
  deckCounts,
  filterMistakes,
  matchesFilter,
  type MistakeCard,
  mistakeCards,
  type MistakeFilter,
  type QueuedCard,
  type VocabularyCard,
  vocabularyCards,
} from "@/lib/flashcards-core";
import { getSettings } from "@/lib/settings";
import { type Grade, newReviewState, type ReviewState, schedule } from "@/lib/srs";
import { categoryLabel, countsInStats, subtypeLabel, TENSE_LABELS, TENSES } from "@/lib/taxonomy";
import { getVocabulary } from "@/lib/vocabulary";

function loadStates(kind: CardKind): Map<string, ReviewState> {
  const rows = db.select().from(schema.reviews).where(eq(schema.reviews.kind, kind)).all();
  return new Map(
    rows.map((r) => [
      r.cardKey,
      {
        ease: r.ease,
        intervalDays: r.intervalDays,
        repetitions: r.repetitions,
        lapses: r.lapses,
        dueAt: r.dueAt.getTime(),
      },
    ]),
  );
}

function withStates<C extends Card>(cards: C[], kind: CardKind): QueuedCard<C>[] {
  const states = loadStates(kind);
  return cards.map((card) => ({ card, state: states.get(card.key) ?? null }));
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

export interface FilterOption {
  filter: MistakeFilter;
  label: string;
  /** Cards to study now (due + new). */
  toStudy: number;
  total: number;
}

/** Overview of both decks, plus the tenses and error types the mistake deck can be narrowed to. */
export function getFlashcardsOverview() {
  const now = Date.now();
  const mistakes = withStates(loadMistakeCards(), "mistake");

  const option = (filter: MistakeFilter, label: string): FilterOption => {
    const counts = deckCounts(
      mistakes.filter((c) => matchesFilter(c.card, filter)),
      now,
    );
    return { filter, label, toStudy: counts.due + counts.new, total: counts.total };
  };

  const present = <T,>(values: T[]) => [...new Set(values)];
  const cards = mistakes.map((c) => c.card);

  const tenses = TENSES.filter((t) => cards.some((c) => c.tense === t)).map((t) => option({ tense: t }, TENSE_LABELS[t]));

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
    vocabulary: deckCounts(getVocabularyDeck(), now),
    mistakes: deckCounts(mistakes, now),
    tenses,
    categories,
  };
}

export function getStudyQueue(kind: CardKind, filter: MistakeFilter = {}): QueuedCard[] {
  const now = Date.now();
  return kind === "vocabulary" ? buildQueue(getVocabularyDeck(), now) : buildQueue(getMistakeDeck(filter), now);
}

/** Stores the learner's grade for a card and returns its new state. */
export function recordReview(kind: CardKind, cardKey: string, grade: Grade): ReviewState {
  const now = Date.now();
  const where = and(eq(schema.reviews.kind, kind), eq(schema.reviews.cardKey, cardKey));
  const row = db.select().from(schema.reviews).where(where).get();
  const previous: ReviewState = row
    ? { ease: row.ease, intervalDays: row.intervalDays, repetitions: row.repetitions, lapses: row.lapses, dueAt: row.dueAt.getTime() }
    : newReviewState(now);
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
  return next;
}

export type FlashcardsOverview = ReturnType<typeof getFlashcardsOverview>;
