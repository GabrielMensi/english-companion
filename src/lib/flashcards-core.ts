/**
 * Pure flashcard logic shared by the decks: vocabulary (words looked up with
 * [brackets], Spanish → English), mistakes (real corrections, original →
 * correction), missed exercises (items got wrong in Practice) and hard-to-say
 * sentences (read aloud with pronunciation issues). Scheduling lives in `srs.ts`; review state is stored per card
 * in the `reviews` table, keyed by (kind, card key).
 */

import type { ReviewState } from "@/lib/srs";
import type { ErrorCategory, PronunciationCategory, Tense } from "@/lib/taxonomy";
import type { VocabularyWord } from "@/lib/vocabulary-core";

export const CARD_KINDS = ["vocabulary", "mistake", "exercise", "pronunciation"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface VocabularyCard {
  kind: "vocabulary";
  key: string;
  spanish: string;
  english: string[];
  note: string | null;
  /** Sentence where the word was used, with the English masked out as a hint. */
  hint: string | null;
  /** The same sentence, unmasked, shown with the answer. */
  context: { text: string; sessionId: string } | null;
}

export interface MistakeCard {
  kind: "mistake";
  key: string;
  original: string;
  correction: string;
  explanation: string;
  category: ErrorCategory;
  subtype: string | null;
  tense: Tense | null;
  /** The learner's sentence where `original` appeared (not the whole message). */
  sentence: string;
  /** The sentence with only this mistake fixed. */
  fixedSentence: string;
  sessionId: string;
  timesMade: number;
  lastSeen: number;
}

/** An exercise item the learner got wrong in Practice (see the `missed_exercises` table). */
export interface ExerciseCard {
  kind: "exercise";
  key: string;
  /** The exercise as shown in the practice chat. */
  sentence: string;
  answer: string;
  why: string;
  /** What the learner wrote back then. */
  learnerAnswer: string;
  /** What was practiced: "Present perfect vs past simple", "Prepositions"... */
  topic: string;
  /** Answers the typed answer is compared with: the sentence, or just what fills the gaps. */
  accepted: string[];
  /** The practice chat, unless it was deleted. */
  sessionId: string | null;
  missedAt: number;
}

/**
 * A sentence read aloud on the Read aloud page with words heard differently,
 * to read again. Keyed by the sentence text (see `read_aloud_attempts`).
 */
export interface PronunciationCard {
  kind: "pronunciation";
  key: string;
  text: string;
  /** The words heard differently, most repeated first. */
  words: { expected: string; heard: string; category: PronunciationCategory; detail: string | null }[];
  /** Readings of the sentence with at least one issue. */
  timesMissed: number;
  lastMissedAt: number;
}

export type Card = VocabularyCard | MistakeCard | ExerciseCard | PronunciationCard;

/** A card with its review state; `state` is null for cards never reviewed. */
export interface QueuedCard<C extends Card = Card> {
  card: C;
  state: ReviewState | null;
}

/** Collapses whitespace; mistakes are grouped case-sensitively (capitalization is a mistake type). */
function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function mistakeKey(original: string, correction: string): string {
  return `${squash(original)} → ${squash(correction)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces every occurrence of any term (case-insensitive) with a blank. */
export function maskTerms(text: string, terms: string[]): string {
  const sorted = terms.filter((t) => t.trim()).sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return text;
  const pattern = new RegExp(sorted.map(escapeRegExp).join("|"), "gi");
  return text.replace(pattern, "_____");
}

/** Where `fragment` appears in `text`, allowing different whitespace (and case, as a fallback). */
function findFragment(text: string, fragment: string): { index: number; length: number } | null {
  const words = squash(fragment).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const source = words.map(escapeRegExp).join("\\s+");
  const match = new RegExp(source).exec(text) ?? new RegExp(source, "i").exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

/** The text with the first occurrence of `original` replaced by `correction`. */
export function applyCorrection(sentence: string, original: string, correction: string): string {
  const match = findFragment(sentence, original);
  if (!match) return sentence;
  return sentence.slice(0, match.index) + squash(correction) + sentence.slice(match.index + match.length);
}

export const MAX_SENTENCE_LENGTH = 240;

/**
 * The sentence of `text` that contains the first of `fragments` found, so a
 * card shows one sentence instead of a whole message. Too long a sentence is
 * cut around the fragment, with ellipses.
 */
export function sentenceAround(text: string, fragments: string[], max = MAX_SENTENCE_LENGTH): string {
  const match = fragments.map((f) => findFragment(text, f)).find((m) => m !== null) ?? null;
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  if (!match) return flat(text).length > max ? `${flat(text).slice(0, max).trimEnd()}…` : flat(text);

  // Sentence boundaries: end punctuation followed by a space, or a line break.
  const boundary = /[.!?]+["')\]]?\s+|\n+/g;
  let start = 0;
  let end = text.length;
  for (const b of text.matchAll(boundary)) {
    const after = b.index + b[0].length;
    if (after <= match.index) start = after;
    else if (b.index >= match.index + match.length) {
      end = after;
      break;
    }
  }
  const sentence = text.slice(start, end);
  if (flat(sentence).length <= max) return flat(sentence);

  // Keep a window around the fragment.
  const at = match.index - start;
  const room = Math.max(0, Math.floor((max - match.length) / 2));
  const from = Math.max(0, at - room);
  const to = Math.min(sentence.length, at + match.length + room);
  return `${from > 0 ? "…" : ""}${flat(sentence.slice(from, to))}${to < sentence.length ? "…" : ""}`;
}

export function vocabularyCards(words: VocabularyWord[]): VocabularyCard[] {
  return words.map((w) => {
    // Prefer a sentence that actually contains the English, so the blank is meaningful.
    const source =
      w.contexts.find((c) => maskTerms(c.text, w.english) !== c.text) ?? w.contexts[0] ?? null;
    const text = source ? sentenceAround(source.text, w.english) : null;
    const hint = text ? maskTerms(text, w.english) : null;
    return {
      kind: "vocabulary",
      key: w.key,
      spanish: w.spanish,
      english: w.english,
      note: w.note,
      hint: hint && hint !== text ? hint : null,
      context: source && text ? { text, sessionId: source.sessionId } : null,
    };
  });
}

export interface MistakeRow {
  id: string;
  original: string;
  correction: string;
  explanation: string;
  category: ErrorCategory;
  subtype: string | null;
  tense: Tense | null;
  createdAt: number;
  sessionId: string;
  /** What the learner wrote (the whole message). */
  sentence: string;
}

/**
 * One card per distinct mistake (same original → same correction), newest
 * first. The caller passes only the corrections that count in the stats.
 * Mistakes that aren't a change, or are keyboard slips, are skipped.
 */
export function mistakeCards(rows: MistakeRow[]): MistakeCard[] {
  const cards = new Map<string, MistakeCard>();
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);

  for (const row of sorted) {
    const original = squash(row.original);
    const correction = squash(row.correction);
    if (!original || !correction || original === correction) continue;
    // A keyboard slip in a word the learner knows isn't worth a card.
    if (row.category === "spelling" && row.subtype === "keyboard_typo") continue;
    const key = mistakeKey(original, correction);
    const existing = cards.get(key);
    if (existing) {
      existing.timesMade++;
      // The newest classification wins, but fill in what it lacks from older ones.
      existing.subtype ??= row.subtype;
      existing.tense ??= row.tense;
      continue;
    }
    const sentence = sentenceAround(row.sentence, [row.original]);
    cards.set(key, {
      kind: "mistake",
      key,
      original,
      correction,
      explanation: row.explanation,
      category: row.category,
      subtype: row.subtype,
      tense: row.tense,
      sentence,
      fixedSentence: applyCorrection(sentence, row.original, row.correction),
      sessionId: row.sessionId,
      timesMade: 1,
      lastSeen: row.createdAt,
    });
  }
  return [...cards.values()];
}

/** Narrows the mistake deck to one tense, one category or one category + type. */
export interface MistakeFilter {
  tense?: Tense;
  category?: ErrorCategory;
  subtype?: string;
}

export function matchesFilter(card: MistakeCard, filter: MistakeFilter): boolean {
  return (
    (!filter.tense || card.tense === filter.tense) &&
    (!filter.category || card.category === filter.category) &&
    (!filter.subtype || card.subtype === filter.subtype)
  );
}

export function filterMistakes(cards: MistakeCard[], filter: MistakeFilter): MistakeCard[] {
  return cards.filter((c) => matchesFilter(c, filter));
}

export interface DeckCounts {
  total: number;
  /** Never reviewed. */
  new: number;
  /** Reviewed before and due now. */
  due: number;
  /** Reviewed and answered correctly at least once in a row. */
  learned: number;
  /** When the next not-yet-due card is due, if any. */
  nextDueAt: number | null;
}

export function deckCounts(cards: QueuedCard[], now: number): DeckCounts {
  let fresh = 0;
  let due = 0;
  let learned = 0;
  let nextDueAt: number | null = null;
  for (const { state } of cards) {
    if (!state) {
      fresh++;
      continue;
    }
    if (state.dueAt <= now) due++;
    else nextDueAt = nextDueAt === null ? state.dueAt : Math.min(nextDueAt, state.dueAt);
    if (state.repetitions > 0) learned++;
  }
  return { total: cards.length, new: fresh, due, learned, nextDueAt };
}

export const NEW_CARDS_PER_SESSION = 20;
export const MAX_SESSION_CARDS = 100;

/**
 * Cards to study now: due reviews first (most overdue first), then up to
 * `newLimit` new cards in the order given (the decks are newest first).
 */
export function buildQueue<C extends Card>(
  cards: QueuedCard<C>[],
  now: number,
  newLimit = NEW_CARDS_PER_SESSION,
  maxCards = MAX_SESSION_CARDS,
): QueuedCard<C>[] {
  const due = cards
    .filter((c): c is QueuedCard<C> & { state: ReviewState } => c.state !== null && c.state.dueAt <= now)
    .sort((a, b) => a.state.dueAt - b.state.dueAt);
  const fresh = cards.filter((c) => c.state === null).slice(0, newLimit);
  return [...due, ...fresh].slice(0, maxCards);
}

/** Loose comparison: case, accents, punctuation and extra spaces don't matter. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export type AnswerMatch = "exact" | "close" | "wrong";

/**
 * How the typed answer compares with the accepted ones. "close" allows a
 * small typo (one edit, two for longer answers). The learner still grades
 * the card; this only helps them decide.
 */
export function checkAnswer(typed: string, accepted: string[]): AnswerMatch | null {
  const answer = normalizeAnswer(typed);
  if (!answer) return null;
  let best: AnswerMatch = "wrong";
  for (const option of accepted) {
    const target = normalizeAnswer(option);
    if (!target) continue;
    if (answer === target) return "exact";
    const allowed = target.length > 12 ? 2 : 1;
    if (editDistance(answer, target) <= allowed) best = "close";
  }
  return best;
}
