/**
 * Pure, transparent CEFR level estimate from the learner's own writing.
 *
 * It is NOT a placement test: it only looks at what the app can see (written
 * or dictated messages and their mistakes), and the thresholds are rough
 * heuristics inspired by learner-corpus research, not a calibrated model.
 * Four signals are each mapped to a score from 1 (A1) to 6 (C2) with fixed
 * anchor points, and the estimate is their weighted average:
 *
 * - accuracy: counted mistakes per 100 words (fewer is better);
 * - grammar range: how advanced the tenses the learner uses regularly are;
 * - sentence complexity: words per sentence and subordinate clauses;
 * - vocabulary: lexical diversity (MATTR) and share of long words.
 *
 * The AI can explain the result later, but never changes it.
 */
import type { InputMode } from "@/db/schema";
import { countsInStats, type ErrorCategory, type Severity, type Tense, TENSES } from "@/lib/taxonomy";
import type { TenseCounts } from "@/lib/tenses-core";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export interface LevelMessage {
  id: string;
  createdAt: number;
  wordCount: number;
  /** What the learner wrote (their own words, not the correction). */
  text: string;
  inputMode: InputMode;
  /** Tenses in the corrected text (see tenses-core). */
  tenseCounts: TenseCounts;
}

export interface LevelCorrection {
  messageId: string;
  severity: Severity;
  category: ErrorCategory;
  inputMode: InputMode;
}

export type SignalId = "accuracy" | "grammar" | "complexity" | "vocabulary";

export interface LevelSignal {
  id: SignalId;
  label: string;
  /** Score from 1 (A1) to 6 (C2). */
  score: number;
  level: CefrLevel;
  weight: number;
  /** The measured value, human-readable ("6.3 mistakes per 100 words"). */
  value: string;
  /** How the value turns into a level, in one sentence. */
  basis: string;
}

export type Confidence = "low" | "medium" | "high";

export interface LevelEstimate {
  /** Null when there isn't enough writing to say anything. */
  level: CefrLevel | null;
  score: number | null;
  /** Where in the band: the score is closer to the level below, the middle, or the level above. */
  position: "low" | "mid" | "high" | null;
  /** Plausible range given how much writing there is. */
  range: { from: CefrLevel; to: CefrLevel } | null;
  confidence: Confidence | null;
  words: number;
  messages: number;
  /** Words still needed before an estimate is shown. */
  wordsNeeded: number;
  signals: LevelSignal[];
  /** Words looked up with [brackets] per 1,000 words: context only, not scored. */
  lookupsPer1000Words: number | null;
  period: { from: number; to: number } | null;
}

export interface LevelWindow {
  from: number;
  to: number;
  words: number;
  per100Words: number;
  score: number;
  level: CefrLevel;
}

export const MIN_WORDS = 300;
const MEDIUM_WORDS = 1000;
const HIGH_WORDS = 3000;
/** The estimate looks at the most recent writing, up to this many words. */
export const WINDOW_WORDS = 3000;
/** The evolution splits the history into chunks of at least this many words. */
export const CHUNK_WORDS = 500;

const WEIGHTS: Record<SignalId, number> = { accuracy: 0.4, grammar: 0.2, complexity: 0.2, vocabulary: 0.2 };

/**
 * Anchor values for A1…C2 (score 1…6). Between anchors the score is linear,
 * outside them it's clamped. Rough heuristics, documented in the UI.
 */
const ANCHORS = {
  /** Counted mistakes per 100 words (decreasing). */
  errorRate: [20, 13, 8, 4.5, 2.2, 1],
  /** Average words per sentence. */
  sentenceLength: [7, 9, 12, 15, 18, 21],
  /** Subordinating words (because, which, although…) per sentence. */
  subordination: [0.1, 0.3, 0.55, 0.8, 1.1, 1.4],
  /** Moving-average type-token ratio over 50-word windows. */
  mattr: [0.55, 0.62, 0.68, 0.73, 0.78, 0.82],
  /** Share of words with 7+ letters. */
  longWords: [0.08, 0.11, 0.14, 0.17, 0.2, 0.23],
} as const;

/**
 * When each tense is usually learned (after the English Profile / CEFR grammar
 * inventories). Tenses alone can't show more than B2.
 */
export const TENSE_LEVELS: Record<Tense, number> = {
  present_simple: 1,
  present_continuous: 1,
  past_simple: 2,
  future_going_to: 2,
  future_will: 2,
  future_present_continuous: 2,
  past_continuous: 2,
  present_perfect: 3,
  used_to_would: 3,
  conditional_would: 3,
  present_perfect_continuous: 3,
  past_perfect: 3,
  future_continuous: 4,
  past_perfect_continuous: 4,
  future_perfect: 4,
};
/** A tense counts as "used regularly" from this many uses. */
const MIN_TENSE_USES = 2;
/** The grammar score averages the most advanced tenses used. */
const TOP_TENSES = 4;

const SUBORDINATORS = new Set([
  "because", "although", "though", "while", "whereas", "unless", "since", "if", "when", "whenever",
  "which", "who", "whom", "whose", "where", "that", "until", "before", "after", "once", "whether",
  "however", "therefore", "otherwise",
]);

export function estimateLevel(input: {
  messages: LevelMessage[];
  corrections: LevelCorrection[];
  countTypos: boolean;
  /** Vocabulary lookups ([brackets]) made in the same messages. */
  lookups?: number;
}): LevelEstimate {
  const words = sum(input.messages.map((m) => m.wordCount));
  const base = {
    words,
    messages: input.messages.length,
    wordsNeeded: Math.max(0, MIN_WORDS - words),
    lookupsPer1000Words: words > 0 && input.lookups !== undefined ? round((input.lookups / words) * 1000, 1) : null,
    period:
      input.messages.length > 0
        ? {
            from: Math.min(...input.messages.map((m) => m.createdAt)),
            to: Math.max(...input.messages.map((m) => m.createdAt)),
          }
        : null,
  };
  if (words < MIN_WORDS) {
    return { ...base, level: null, score: null, position: null, range: null, confidence: null, signals: [] };
  }

  const signals = [
    accuracySignal(input.messages, input.corrections, input.countTypos, words),
    grammarSignal(input.messages),
    complexitySignal(input.messages),
    vocabularySignal(input.messages),
  ];
  const score = round(
    sum(signals.map((s) => s.score * s.weight)) / sum(signals.map((s) => s.weight)),
    2,
  );
  const confidence: Confidence = words >= HIGH_WORDS ? "high" : words >= MEDIUM_WORDS ? "medium" : "low";
  const spread = confidence === "high" ? 0.35 : confidence === "medium" ? 0.6 : 1;

  return {
    ...base,
    level: levelOf(score),
    score,
    position: positionOf(score),
    range: { from: levelOf(score - spread), to: levelOf(score + spread) },
    confidence,
    signals,
  };
}

/** The most recent messages, newest last, up to `maxWords` (always at least one message). */
export function recentWindow<T extends { createdAt: number; wordCount: number }>(
  messages: T[],
  maxWords = WINDOW_WORDS,
): T[] {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const out: T[] = [];
  let words = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (out.length > 0 && words + sorted[i].wordCount > maxWords) break;
    out.unshift(sorted[i]);
    words += sorted[i].wordCount;
  }
  return out;
}

/**
 * How the estimate evolved: the history split into consecutive chunks of at
 * least `chunkWords` words (a short last chunk joins the previous one).
 */
export function levelEvolution(input: {
  messages: LevelMessage[];
  corrections: LevelCorrection[];
  countTypos: boolean;
  chunkWords?: number;
}): LevelWindow[] {
  const chunkWords = input.chunkWords ?? CHUNK_WORDS;
  const sorted = [...input.messages].sort((a, b) => a.createdAt - b.createdAt);
  const chunks: LevelMessage[][] = [];
  let current: LevelMessage[] = [];
  let words = 0;
  for (const m of sorted) {
    current.push(m);
    words += m.wordCount;
    if (words >= chunkWords) {
      chunks.push(current);
      current = [];
      words = 0;
    }
  }
  if (current.length > 0) {
    if (chunks.length > 0 && words < chunkWords) chunks[chunks.length - 1].push(...current);
    else chunks.push(current);
  }

  const byMessage = groupBy(input.corrections, (c) => c.messageId);
  return chunks
    .map((chunk) => {
      const corrections = chunk.flatMap((m) => byMessage.get(m.id) ?? []);
      const estimate = estimateLevel({ messages: chunk, corrections, countTypos: input.countTypos });
      if (estimate.score === null) return null;
      const counted = corrections.filter((c) => countsInStats(c, input.countTypos)).length;
      return {
        from: chunk[0].createdAt,
        to: chunk[chunk.length - 1].createdAt,
        words: estimate.words,
        per100Words: round((counted / estimate.words) * 100, 2),
        score: estimate.score,
        level: estimate.level!,
      };
    })
    .filter((w): w is LevelWindow => w !== null);
}

function accuracySignal(
  messages: LevelMessage[],
  corrections: LevelCorrection[],
  countTypos: boolean,
  words: number,
): LevelSignal {
  const ids = new Set(messages.map((m) => m.id));
  const counted = corrections.filter((c) => ids.has(c.messageId) && countsInStats(c, countTypos)).length;
  const rate = (counted / words) * 100;
  return signal("accuracy", "Accuracy", scoreDecreasing(rate, ANCHORS.errorRate), {
    value: `${round(rate, 1)} mistakes per 100 words`,
    basis: "Fewer mistakes per 100 words means a higher level: about 13 is A2, 8 is B1, 4.5 is B2, 2 is C1.",
  });
}

function grammarSignal(messages: LevelMessage[]): LevelSignal {
  const totals = new Map<Tense, number>();
  for (const m of messages) {
    for (const [tense, n] of Object.entries(m.tenseCounts) as [Tense, number][]) {
      totals.set(tense, (totals.get(tense) ?? 0) + n);
    }
  }
  const used = TENSES.filter((t) => (totals.get(t) ?? 0) >= MIN_TENSE_USES);
  const top = used.map((t) => TENSE_LEVELS[t]).sort((a, b) => b - a).slice(0, TOP_TENSES);
  // Fewer than TOP_TENSES tenses in use counts the missing ones as A1.
  while (top.length < TOP_TENSES) top.push(1);
  return signal("grammar", "Grammar range", sum(top) / TOP_TENSES, {
    value: `${used.length} ${used.length === 1 ? "tense" : "tenses"} used regularly`,
    basis:
      "Average level of your 4 most advanced tenses used at least twice (present perfect or past perfect are B1, future perfect B2). Tenses alone can't show more than B2.",
  });
}

function complexitySignal(messages: LevelMessage[]): LevelSignal {
  let sentences = 0;
  let words = 0;
  let subordinators = 0;
  for (const m of messages) {
    for (const sentence of splitSentences(cleanText(m.text))) {
      const tokens = tokenize(sentence);
      if (tokens.length === 0) continue;
      sentences++;
      words += tokens.length;
      subordinators += tokens.filter((t) => SUBORDINATORS.has(t)).length;
    }
  }
  const length = sentences > 0 ? words / sentences : 0;
  const subordination = sentences > 0 ? subordinators / sentences : 0;
  const score = (scoreIncreasing(length, ANCHORS.sentenceLength) + scoreIncreasing(subordination, ANCHORS.subordination)) / 2;
  return signal("complexity", "Sentence complexity", score, {
    value: `${round(length, 1)} words per sentence, ${round(subordination, 2)} linking words per sentence`,
    basis:
      "Longer sentences joined with because, which, although, when… mean a higher level: about 9 words per sentence is A2, 12 is B1, 15 is B2.",
  });
}

function vocabularySignal(messages: LevelMessage[]): LevelSignal {
  const tokens = messages.flatMap((m) => tokenize(cleanText(m.text)));
  const diversity = mattr(tokens);
  const long = tokens.length > 0 ? tokens.filter((t) => t.replace(/'/g, "").length >= 7).length / tokens.length : 0;
  const score = (scoreIncreasing(diversity, ANCHORS.mattr) + scoreIncreasing(long, ANCHORS.longWords)) / 2;
  return signal("vocabulary", "Vocabulary", score, {
    value: `${Math.round(diversity * 100)}% different words, ${Math.round(long * 100)}% long words`,
    basis:
      "Repeating fewer words (share of different words in every 50) and using more long words means a richer vocabulary.",
  });
}

function signal(
  id: SignalId,
  label: string,
  rawScore: number,
  text: { value: string; basis: string },
): LevelSignal {
  const score = round(clamp(rawScore, 1, 6), 2);
  return { id, label, score, level: levelOf(score), weight: WEIGHTS[id], ...text };
}

/** Moving-average type-token ratio: the share of different words in every window of `size` words. */
export function mattr(tokens: string[], size = 50): number {
  if (tokens.length === 0) return 0;
  if (tokens.length <= size) return new Set(tokens).size / tokens.length;
  const counts = new Map<string, number>();
  for (let i = 0; i < size; i++) counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
  let total = counts.size / size;
  for (let i = size; i < tokens.length; i++) {
    const out = tokens[i - size];
    const n = counts.get(out)! - 1;
    if (n === 0) counts.delete(out);
    else counts.set(out, n);
    counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
    total += counts.size / size;
  }
  return total / (tokens.length - size + 1);
}

/** Removes code, URLs, paths and [Spanish lookups], which aren't the learner's English. */
export function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bhttps?:\/\/\S+/g, " ")
    .replace(/\S*[/\\]\S*/g, " ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lowercase English words; tokens with digits, underscores or other symbols (identifiers) are dropped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/[\s,;:!?.()"“”…]+/)
    .filter((t) => /^[a-z]+(?:['-][a-z]+)*$/.test(t));
}

/** Score from 1 to 6 for a value that grows with the level. */
export function scoreIncreasing(value: number, anchors: readonly number[]): number {
  if (value <= anchors[0]) return 1;
  for (let i = 1; i < anchors.length; i++) {
    if (value <= anchors[i]) return i + (value - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
  }
  return anchors.length;
}

/** Score from 1 to 6 for a value that shrinks as the level grows (mistakes). */
export function scoreDecreasing(value: number, anchors: readonly number[]): number {
  return scoreIncreasing(-value, anchors.map((a) => -a));
}

export function levelOf(score: number): CefrLevel {
  return CEFR_LEVELS[clamp(Math.round(score), 1, 6) - 1];
}

function positionOf(score: number): "low" | "mid" | "high" {
  const offset = score - clamp(Math.round(score), 1, 6);
  return offset < -0.17 ? "low" : offset > 0.17 ? "high" : "mid";
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}
