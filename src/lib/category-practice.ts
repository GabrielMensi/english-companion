/**
 * Pure parts of the targeted exercises for the weakest error categories (see
 * docs/ROADMAP.md, "Ejercicios dirigidos"): which categories to practice and
 * how each answer is checked. The set is shown and answered in one message,
 * like the tense drills (src/lib/exercise-set.ts). Kept free of server-only
 * imports so it can be unit tested.
 */
import type { Stats } from "@/lib/stats-core";
import { CATEGORY_HINTS, CATEGORY_LABELS, type ErrorCategory } from "@/lib/taxonomy";
import { isValidSubtype, subtypeLabel } from "@/lib/subtypes";
import { comparable } from "@/lib/tense-practice";
import { escapeRegExp } from "@/lib/text";

/**
 * - fill: a sentence with a gap ("I am ___ engineer.").
 * - choice: a gap followed by the options in brackets ("She is interested ___ (in / on / at) AI.").
 * - rewrite: a sentence with one mistake to fix ("Fix the mistake: I am agree with you.").
 */
export const EXERCISE_FORMATS = ["fill", "choice", "rewrite"] as const;
export type ExerciseFormat = (typeof EXERCISE_FORMATS)[number];

export interface CategoryExerciseItem {
  sentence: string;
  /** The full correct sentence. */
  answer: string;
  /** The rule, in the explanation language. */
  why: string;
  format: ExerciseFormat;
}

export interface CategoryPractice {
  kind: "category";
  category: ErrorCategory;
  /** The fixed type to focus on, when one stands out. */
  subtype: string | null;
  items: CategoryExerciseItem[];
}

export interface CategoryTarget {
  category: ErrorCategory;
  subtype: string | null;
  /** "suggested" when there's no data yet and it's a common problem for Spanish speakers. */
  status: "weak" | "suggested";
  /** One line for the UI explaining why this category was picked. */
  reason: string;
}

/**
 * Categories that don't make good short exercises: tenses have their own
 * practice, spelling / punctuation / capitalization are mostly slips (and the
 * transcriber's decision in dictated messages), and "other" has no rule to drill.
 */
export const NOT_PRACTICED: readonly ErrorCategory[] = [
  "verb_tense",
  "spelling",
  "punctuation",
  "capitalization",
  "other",
];

/** Counted mistakes needed for a category to be worth practicing. */
const MIN_ERRORS = 2;

/** The classic problems for Spanish speakers, offered while there's no data to pick from. */
export const SUGGESTED_CATEGORY_TARGETS: CategoryTarget[] = [
  {
    category: "articles",
    subtype: "missing_a_an",
    status: "suggested",
    reason: "A classic for Spanish speakers: “I am an engineer”, not “I am engineer”.",
  },
  {
    category: "prepositions",
    subtype: "dependent_preposition",
    status: "suggested",
    reason: "Prepositions that go with a verb or adjective: “depend on”, “interested in”, “good at”.",
  },
  {
    category: "gerund_infinitive",
    subtype: null,
    status: "suggested",
    reason: "Verb patterns: “I enjoy reading”, “I need you to check it”, “I came to learn”.",
  },
];

/**
 * Picks the categories with the most counted mistakes per 100 words (the
 * caller passes the dashboard stats, which only include mistakes that count),
 * with the most frequent type of each when one stands out. Falls back to
 * {@link SUGGESTED_CATEGORY_TARGETS} when nothing stands out.
 */
export function selectCategoryTargets(stats: Pick<Stats, "categories" | "topMistakes">, limit = 3): CategoryTarget[] {
  const targets = stats.categories
    .filter((c) => !NOT_PRACTICED.includes(c.category) && c.count >= MIN_ERRORS)
    .sort((a, b) => b.per100Words - a.per100Words || b.score - a.score || b.count - a.count)
    .slice(0, limit)
    .map((c): CategoryTarget => {
      const top = c.topSubtypes[0];
      const subtype = top && top.subtype !== "other" && top.count >= MIN_ERRORS ? top.subtype : null;
      const example =
        stats.topMistakes.find((m) => m.category === c.category && (subtype === null || m.subtype === subtype))
          ?.example ?? null;
      const parts = [`${c.per100Words} per 100 words (${c.count} ${c.count === 1 ? "mistake" : "mistakes"})`];
      if (subtype) parts.push(`most often: ${subtypeLabel(c.category, subtype)?.toLowerCase()}`);
      const reason = `${parts.join(", ")}${example ? ` — “${example.original}” → “${example.correction}”` : ""}.`;
      return { category: c.category, subtype, status: "weak", reason };
    });

  return targets.length > 0 ? targets : SUGGESTED_CATEGORY_TARGETS.slice(0, limit);
}

/** "Prepositions" or "Prepositions: verb / adjective + preposition". */
export function categoryTopic(practice: { category: ErrorCategory; subtype: string | null }): string {
  const type = practice.subtype ? subtypeLabel(practice.category, practice.subtype) : null;
  const label = CATEGORY_LABELS[practice.category];
  return type && type !== "Other" ? `${label}: ${type.toLowerCase()}` : label;
}

export function categoryPracticeTitle(practice: { category: ErrorCategory; subtype: string | null }): string {
  return `Practice: ${categoryTopic(practice).toLowerCase()}`;
}

/** The subtype if it belongs to the category, else null. */
export function validSubtype(category: ErrorCategory, subtype: string | null | undefined): string | null {
  return subtype && isValidSubtype(category, subtype) ? subtype : null;
}

/** What the category is about, for prompts. */
export function categoryDescription(category: ErrorCategory): string {
  return `${CATEGORY_LABELS[category].toLowerCase()} (${CATEGORY_HINTS[category]})`;
}

// ---------------------------------------------------------------------------
// Gaps

const GAP = /_{3,}/;
/** A bracketed hint right after a gap: the options "(in / on / at)" or a base verb "(go)". */
const HINT = /^\s*\(([^)]*)\)/;
const REWRITE_PREFIX = /^\s*(fix|correct|rewrite)[^:]{0,40}:\s*/i;

export interface GapSentence {
  /** The text around the gaps, without the hints. */
  parts: string[];
  /** The options offered for each gap; empty for a gap without options. */
  options: string[][];
}

export function parseGaps(sentence: string): GapSentence {
  const raw = sentence.split(GAP);
  const parts = [raw[0]];
  const options: string[][] = [];
  for (const piece of raw.slice(1)) {
    const hint = HINT.exec(piece);
    options.push(
      hint && hint[1].includes("/")
        ? hint[1]
            .split("/")
            .map((o) => o.trim())
            .filter(Boolean)
        : [],
    );
    parts.push(hint ? piece.slice(hint[0].length) : piece);
  }
  return { parts, options };
}

/**
 * What fills the gaps of `sentence` in `text`, when `text` is the sentence with
 * the gaps filled in (ignoring case, punctuation and contractions). Null when
 * the sentence has no gaps or `text` doesn't follow it.
 */
export function gapFills(sentence: string, text: string): string[] | null {
  const { parts } = parseGaps(sentence);
  if (parts.length < 2) return null;
  const pattern = new RegExp(`^${parts.map((p) => escapeRegExp(comparable(p))).join(" ?(.*?) ?")}$`);
  const match = pattern.exec(comparable(text));
  return match ? match.slice(1).map((f) => f.trim()) : null;
}

/** The format of an item, from how its sentence looks. */
export function formatOf(sentence: string): ExerciseFormat {
  if (!GAP.test(sentence)) return "rewrite";
  return parseGaps(sentence).options.some((o) => o.length > 1) ? "choice" : "fill";
}

/** The wrong sentence of a rewrite item, without "Fix the mistake:" and quotes. */
export function rewriteSource(sentence: string): string {
  return sentence
    .replace(REWRITE_PREFIX, "")
    .replace(/^["“'‘]|["”'’]$/g, "")
    .trim();
}

/** Accepted answers for a flashcard made from an exercise item: the sentence, or just what fills the gaps. */
export function acceptedAnswers(item: { sentence: string; answer: string }): string[] {
  const fills = gapFills(item.sentence, item.answer);
  return fills && fills.every(Boolean) ? [item.answer, fills.join(" ")] : [item.answer];
}

// ---------------------------------------------------------------------------
// Checking answers

export type CategoryCheck = "exact" | "right" | "wrong" | "unknown";

/** What the correction pipeline found in the learner's answer (only mistakes that count in the stats). */
export interface AnswerSignals {
  /** Mistakes in the practiced category. */
  categoryErrors: number;
  /** Mistakes in any category. */
  errors: number;
}

/**
 * Compares the learner's answer with the expected one. Gap items are checked
 * by what fills the gaps (the learner can write the full sentence or just the
 * missing words). Otherwise the correction decides: a mistake in the practiced
 * category is wrong, and a rewrite without mistakes is right. "unknown" when
 * neither can tell (the answer is shown without ✓/✗).
 */
export function checkCategoryAnswer(
  learnerText: string,
  item: CategoryExerciseItem,
  signals: AnswerSignals,
): CategoryCheck {
  const learner = comparable(learnerText);
  if (!learner) return "unknown";
  if (learner === comparable(item.answer)) return "exact";

  if (item.format !== "rewrite") {
    const expected = gapFills(item.sentence, item.answer);
    if (expected) {
      const got = gapFills(item.sentence, learnerText);
      if (got) return got.every((f, i) => f === expected[i]) ? "exact" : "wrong";
      // Just the missing word(s).
      if (learner === expected.join(" ")) return "exact";
      const words = learner.split(" ").length;
      if (words <= expected.join(" ").split(" ").length + 1) return "wrong";
    }
  } else if (learner === comparable(rewriteSource(item.sentence))) {
    // The same sentence, mistake included.
    return "wrong";
  }

  if (signals.categoryErrors > 0) return "wrong";
  if (item.format === "rewrite" && signals.errors === 0) return "right";
  return "unknown";
}

// ---------------------------------------------------------------------------
// The exercise chat

export function categoryExerciseIntro(practice: Pick<CategoryPractice, "category" | "subtype" | "items">): string {
  const n = practice.items.length;
  const formats = new Set(practice.items.map((i) => i.format));
  const how = [
    formats.has("fill") && "fill in the gap",
    formats.has("choice") && "choose the right option",
    formats.has("rewrite") && "fix the mistake (write the whole sentence)",
  ].filter(Boolean);
  const list = how.length > 1 ? `${how.slice(0, -1).join(", ")} or ${how.at(-1)}` : (how[0] ?? "answer");
  return `Let’s practice ${categoryTopic(practice).toLowerCase()}: ${n} short exercises. For each one, ${list}.`;
}
