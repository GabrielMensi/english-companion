/**
 * Pure, transparent CEFR level estimate from the learner's own writing.
 *
 * It is NOT a placement test: it only looks at what the app can see (written
 * or dictated messages and their mistakes). Four signals are each mapped to a
 * score from 1 (A1) to 6 (C2) with fixed anchor points, and the estimate is
 * their weighted average:
 *
 * - accuracy: counted mistakes per 100 words (fewer is better);
 * - vocabulary: lexical diversity (MATTR) and share of long words;
 * - sentence complexity: words per sentence and subordinate clauses;
 * - grammar range: how advanced the tenses the learner uses regularly are
 *   (shown for context, not scored).
 *
 * The AI can explain the result later, but never changes it.
 *
 * Calibration (`pnpm eval:level`, details in docs/progress/LEVEL_CALIBRATION.md):
 * the anchors and weights were checked against ~3,300 Write & Improve
 * essays graded A1–C2 by Cambridge annotators, joined into simulated
 * learners of ~1,000 words.
 * - Accuracy is by far the best signal (rank correlation 0.9 with the human
 *   level). Its anchors are the median mistake rate of each level in the
 *   corpus, scaled to what the app's AI counts (about 0.6 of the corpus'
 *   corrections, measured on 30 essays: the AI ignores optional changes and
 *   typos, and the annotators also fix style).
 * - Vocabulary helps (0.5); its anchors are a straight-line fit per level.
 * - Sentence length and linking words didn't separate the levels at all in
 *   the essays (0.1), and depend on register (chat and prompts use shorter,
 *   simpler sentences than essays) and, when dictating, on the speech-to-text
 *   punctuation: low weight, and only typed messages count.
 * - Tense range didn't separate the levels either: every level used about the
 *   same tenses, since the task decides them. Shown, not scored.
 * Held-out agreement (dev split, learners of 1,000 words) went from 20% exact
 * and 74% within one level to 59% and 100%. That uses the corpus' human
 * corrections, though: in the app the mistakes come from the AI, and chat
 * isn't an essay, so the real error is larger. Treat it as ±1 level.
 */
import type { InputMode } from "@/db/schema";
import { countsInStats, type ErrorCategory, type Severity, type Tense, TENSES } from "@/lib/taxonomy";
import type { TenseCounts } from "@/lib/tenses-core";

import { cleanText, mattr, scoreDecreasing, scoreIncreasing, splitSentences, tokenize } from "./level-text";

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
  /** Discarded by the learner as a wrong correction: never counted. */
  discardedAt: Date | number | null;
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

/** Calibrated with `pnpm eval:level` (see the comment at the top). */
const WEIGHTS: Record<SignalId, number> = { accuracy: 0.65, vocabulary: 0.25, complexity: 0.1, grammar: 0 };

/**
 * Anchor values for A1…C2 (score 1…6). Between anchors the score is linear,
 * outside them it's clamped.
 */
const ANCHORS = {
  /**
   * Counted mistakes per 100 words (decreasing): the median of each level in
   * Write & Improve (13.7, 12.3, 9.5, 6.6, 4.3, 2.6 corrections per 100
   * words) × 0.6, the share of those the app's AI counts.
   */
  errorRate: [8.2, 7.4, 5.7, 4, 2.6, 1.5],
  /** Average words per sentence (no difference between levels in the essays: kept from the original heuristic). */
  sentenceLength: [7, 9, 12, 15, 18, 21],
  /** Subordinating words (because, which, although…) per sentence (same). */
  subordination: [0.1, 0.3, 0.55, 0.8, 1.1, 1.4],
  /** Moving-average type-token ratio over 50-word windows (linear fit on the essays). */
  mattr: [0.774, 0.78, 0.786, 0.792, 0.798, 0.804],
  /** Share of words with 7+ letters (linear fit on the essays). */
  longWords: [0.17, 0.179, 0.188, 0.197, 0.206, 0.215],
} as const;

/**
 * Dictated messages don't count the categories speech-to-text decides or
 * hides (articles, prepositions, pronouns, plurals…; NOT_MEASURABLE_WHEN_SPOKEN),
 * which were half of the mistakes the app's AI counted in the calibration
 * essays (126 of 252). So each counted mistake in a dictated message stands
 * for two, or speaking would look a level or more better than writing.
 */
export const SPOKEN_MISTAKE_FACTOR = 2;

/** Messages shorter than this ("ok, go ahead") don't count for sentence complexity. */
const MIN_COMPLEXITY_WORDS = 6;

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
  "because",
  "although",
  "though",
  "while",
  "whereas",
  "unless",
  "since",
  "if",
  "when",
  "whenever",
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "that",
  "until",
  "before",
  "after",
  "once",
  "whether",
  "however",
  "therefore",
  "otherwise",
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

  const signals = signalsFrom(measureLevel(input.messages, input.corrections, input.countTypos));
  const score = round(sum(signals.map((s) => s.score * s.weight)) / sum(signals.map((s) => s.weight)), 2);
  const confidence: Confidence = words >= HIGH_WORDS ? "high" : words >= MEDIUM_WORDS ? "medium" : "low";
  // About the score error measured by `pnpm eval:level` at 300, 1,000 and 3,000 words (0.85, 0.6, 0.45 levels)
  // with human-counted mistakes, plus a margin for the AI counting them and for chat not being an essay.
  const spread = confidence === "high" ? 0.5 : confidence === "medium" ? 0.75 : 1;

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

/** The raw measurements behind the signals (also used by `pnpm eval:level`). */
export interface LevelMeasures {
  words: number;
  /** Counted mistakes per 100 words (dictated ones scaled by SPOKEN_MISTAKE_FACTOR). */
  errorRate: number;
  /** Counted mistakes in dictated messages, before scaling. */
  spokenMistakes: number;
  /** Tenses used at least MIN_TENSE_USES times. */
  tensesUsed: Tense[];
  /** Average level (1–4) of the most advanced tenses used. */
  grammar: number;
  /** Average words per sentence, in typed messages (see `complexityText`). */
  sentenceLength: number;
  /** Subordinating words per sentence, in the same messages. */
  subordination: number;
  /**
   * Share of the words that were typed. Sentence complexity only counts typed
   * messages, since dictated ones get their punctuation (and so their
   * sentence length) from speech-to-text, and its weight shrinks with it.
   */
  typedShare: number;
  /** Moving-average type-token ratio. */
  mattr: number;
  /** Share of words with 7+ letters. */
  longWords: number;
}

export function measureLevel(
  messages: LevelMessage[],
  corrections: LevelCorrection[],
  countTypos: boolean,
): LevelMeasures {
  const words = sum(messages.map((m) => m.wordCount));
  const ids = new Set(messages.map((m) => m.id));
  const counted = corrections.filter((c) => ids.has(c.messageId) && countsInStats(c, countTypos));
  const spokenMistakes = counted.filter((c) => c.inputMode === "spoken").length;
  // Dictated messages only count about half of the mistake types, so their mistakes are scaled up.
  const mistakes = counted.length - spokenMistakes + spokenMistakes * SPOKEN_MISTAKE_FACTOR;

  const totals = new Map<Tense, number>();
  for (const m of messages) {
    for (const [tense, n] of Object.entries(m.tenseCounts) as [Tense, number][]) {
      totals.set(tense, (totals.get(tense) ?? 0) + n);
    }
  }
  const tensesUsed = TENSES.filter((t) => (totals.get(t) ?? 0) >= MIN_TENSE_USES);
  const top = tensesUsed
    .map((t) => TENSE_LEVELS[t])
    .sort((a, b) => b - a)
    .slice(0, TOP_TENSES);
  // Fewer than TOP_TENSES tenses in use counts the missing ones as A1.
  while (top.length < TOP_TENSES) top.push(1);

  let sentences = 0;
  let sentenceWords = 0;
  let subordinators = 0;
  for (const m of complexityMessages(messages)) {
    for (const sentence of splitSentences(cleanText(m.text))) {
      const tokens = tokenize(sentence);
      if (tokens.length === 0) continue;
      sentences++;
      sentenceWords += tokens.length;
      subordinators += tokens.filter((t) => SUBORDINATORS.has(t)).length;
    }
  }

  const typedWords = sum(messages.filter((m) => m.inputMode === "typed").map((m) => m.wordCount));
  const tokens = messages.flatMap((m) => tokenize(cleanText(m.text)));
  return {
    words,
    errorRate: words > 0 ? (mistakes / words) * 100 : 0,
    spokenMistakes,
    tensesUsed,
    grammar: sum(top) / TOP_TENSES,
    sentenceLength: sentences > 0 ? sentenceWords / sentences : 0,
    subordination: sentences > 0 ? subordinators / sentences : 0,
    typedShare: words > 0 ? typedWords / words : 0,
    mattr: mattr(tokens),
    longWords: tokens.length > 0 ? tokens.filter((t) => t.replace(/'/g, "").length >= 7).length / tokens.length : 0,
  };
}

/**
 * The messages sentence complexity looks at: typed ones (dictated punctuation
 * is the transcriber's), without one-line replies like "ok, go ahead", which
 * are normal in a chat and would pull the average down.
 */
function complexityMessages(messages: LevelMessage[]): LevelMessage[] {
  const typed = messages.filter((m) => m.inputMode === "typed");
  const long = typed.filter((m) => m.wordCount >= MIN_COMPLEXITY_WORDS);
  return long.length > 0 ? long : typed;
}

function signalsFrom(m: LevelMeasures): LevelSignal[] {
  const dictated = m.typedShare === 0;
  return [
    signal("accuracy", "Accuracy", scoreDecreasing(m.errorRate, ANCHORS.errorRate), {
      value:
        `${round(m.errorRate, 1)} mistakes per 100 words` +
        (m.typedShare < 1
          ? " (dictated ones count double: half of the mistake types can't be checked when you speak)"
          : ""),
      basis:
        "Fewer mistakes per 100 words means a higher level: about 7.4 is A2, 5.7 is B1, 4 is B2, 2.6 is C1, 1.5 is C2. The strongest signal in graded learner essays.",
    }),
    signal(
      "vocabulary",
      "Vocabulary",
      (scoreIncreasing(m.mattr, ANCHORS.mattr) + scoreIncreasing(m.longWords, ANCHORS.longWords)) / 2,
      {
        value: `${round(m.mattr * 100, 1)}% different words, ${round(m.longWords * 100, 1)}% long words`,
        basis:
          "Repeating fewer words (share of different words in every 50) and using more long words (7+ letters) means a richer vocabulary: about 78% and 18% is A2, 79% and 20% is B2.",
      },
    ),
    signal(
      "complexity",
      "Sentence complexity",
      (scoreIncreasing(m.sentenceLength, ANCHORS.sentenceLength) +
        scoreIncreasing(m.subordination, ANCHORS.subordination)) /
        2,
      {
        value: dictated
          ? "Not measured: every message was dictated"
          : `${round(m.sentenceLength, 1)} words per sentence, ${round(m.subordination, 2)} linking words per sentence`,
        basis:
          "Longer sentences joined with because, which, although, when… (about 9 words per sentence is A2, 12 is B1, 15 is B2). Low weight: it depends on whether you chat or write an essay, and only typed messages count, since dictated punctuation comes from speech-to-text.",
      },
      WEIGHTS.complexity * m.typedShare,
    ),
    signal("grammar", "Grammar range", m.grammar, {
      value: `${m.tensesUsed.length} ${m.tensesUsed.length === 1 ? "tense" : "tenses"} used regularly`,
      basis:
        "Average level of your 4 most advanced tenses used at least twice (present perfect is B1, future perfect B2). Shown for context, not scored: in graded essays every level used about the same tenses.",
    }),
  ];
}

function signal(
  id: SignalId,
  label: string,
  rawScore: number,
  text: { value: string; basis: string },
  weight = WEIGHTS[id],
): LevelSignal {
  const score = round(clamp(rawScore, 1, 6), 2);
  return { id, label, score, level: levelOf(score), weight: round(weight, 3), ...text };
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
