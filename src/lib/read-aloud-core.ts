/** Read-aloud practice: picking sentences and summing up pronunciation issues. Pure, no AI. */
import type { ReadAloudSource } from "@/db/schema";
import { SOUND_SENTENCES } from "./read-aloud-sentences";
import { PRONUNCIATION_CATEGORIES, type PronunciationCategory } from "./taxonomy";

export interface ReadAloudItem {
  /** Stable within a list, for React keys. */
  key: string;
  text: string;
  source: ReadAloudSource;
  sourceId: string | null;
  focus: PronunciationCategory | null;
  /** The word to pay attention to, and (for built-in sentences) what it may sound like instead. */
  target: string | null;
  confusedWith: string | null;
}

/** Long enough for the transcriber to have context, short enough to read in one breath. */
const MIN_WORDS = 4;
const MAX_WORDS = 18;

/**
 * Sentences of a corrected message that are good to read aloud: plain prose
 * (no digits, code or symbols the transcriber would write its own way).
 */
export function readableSentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]*/g) ?? [])
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => /^[A-Za-z][A-Za-z ,.'’?!;:-]*$/.test(s))
    .filter((s) => {
      const words = s.split(" ").length;
      return words >= MIN_WORDS && words <= MAX_WORDS;
    });
}

/** Built-in sentences, the sounds the learner gets wrong most first, each sound's sentences in order. */
export function soundItems(order: PronunciationCategory[]): ReadAloudItem[] {
  return order.flatMap((category) =>
    category === "other"
      ? []
      : SOUND_SENTENCES[category].map((s, i) => ({
          key: `sounds:${category}:${i}`,
          text: s.text,
          source: "sounds" as const,
          sourceId: null,
          focus: category,
          target: s.target,
          confusedWith: s.confusedWith,
        })),
  );
}

export interface IssueRow {
  category: PronunciationCategory;
  expected: string;
  heard: string;
}

export interface AttemptRow {
  correctWords: number;
  totalWords: number;
}

export interface PronunciationSummary {
  attempts: number;
  /** Share of words heard as written, 0–1; null without attempts. */
  accuracy: number | null;
  /** Most issues first; only categories with issues. */
  categories: {
    category: PronunciationCategory;
    count: number;
    /** The most repeated words, "ship" heard as "sheep". */
    examples: { expected: string; heard: string; count: number }[];
  }[];
}

export function summarizePronunciation(attempts: AttemptRow[], issues: IssueRow[]): PronunciationSummary {
  const words = attempts.reduce((sum, a) => sum + a.totalWords, 0);
  const correct = attempts.reduce((sum, a) => sum + a.correctWords, 0);

  const byCategory = new Map<PronunciationCategory, Map<string, { expected: string; heard: string; count: number }>>();
  for (const issue of issues) {
    const examples = byCategory.get(issue.category) ?? new Map();
    const key = `${issue.expected}|${issue.heard}`;
    const example = examples.get(key) ?? { expected: issue.expected, heard: issue.heard, count: 0 };
    example.count++;
    examples.set(key, example);
    byCategory.set(issue.category, examples);
  }

  const categories = [...byCategory.entries()]
    .map(([category, examples]) => {
      const list = [...examples.values()].sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected));
      return { category, count: list.reduce((sum, e) => sum + e.count, 0), examples: list.slice(0, 3) };
    })
    .sort(
      (a, b) =>
        b.count - a.count || PRONUNCIATION_CATEGORIES.indexOf(a.category) - PRONUNCIATION_CATEGORIES.indexOf(b.category),
    );

  return { attempts: attempts.length, accuracy: words > 0 ? correct / words : null, categories };
}

/** Sounds to practice: the ones with the most issues first, then the rest in taxonomy order. */
export function soundOrder(summary: PronunciationSummary): PronunciationCategory[] {
  const worst = summary.categories.map((c) => c.category).filter((c) => c !== "other");
  return [...worst, ...PRONUNCIATION_CATEGORIES.filter((c) => c !== "other" && !worst.includes(c))];
}

/**
 * The sound to open the page on, from `?focus=`: a category with built-in
 * sentences ("other" has none). Anything else means all sounds.
 */
export function parseFocus(value: string | string[] | undefined): Exclude<PronunciationCategory, "other"> | null {
  const focus = Array.isArray(value) ? value[0] : value;
  return focus && focus !== "other" && (PRONUNCIATION_CATEGORIES as readonly string[]).includes(focus)
    ? (focus as Exclude<PronunciationCategory, "other">)
    : null;
}
