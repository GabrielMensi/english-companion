/**
 * Exercise sets answered in one message (see docs/VERB_TENSES.md, "Práctica"):
 * the whole set is shown at once, the learner answers every item in a single
 * message, and that message costs one AI request (the normal correction). The
 * per-item ✓/✗ comes from deterministic checks: the gap words, the options, the
 * tense counter and the mistakes the correction found inside each answer. Used
 * by the category exercises and the tense contrast / form drills; open "use it"
 * tasks still go one at a time (src/lib/tense-practice.ts). Kept free of
 * server-only imports so it can be unit tested.
 */
import { type CategoryExerciseItem, type CategoryPractice, checkCategoryAnswer, gapFills, parseGaps } from "@/lib/category-practice";
import { type ErrorCategory, TENSE_CATEGORIES, TENSE_LABELS } from "@/lib/taxonomy";
import { checkAnswer, comparable, type ExercisePractice, focusTenses, tensesAmong } from "@/lib/tense-practice";

// ---------------------------------------------------------------------------
// Showing the set

/** The items, numbered, one per paragraph line. */
export function formatSet(items: readonly { sentence: string }[]): string {
  return items.map((item, i) => `${i + 1}. ${item.sentence}`).join("\n");
}

/** How to answer, shown after the items. */
export function answerInstructions(count: number): string {
  const example = count > 1 ? "\n1. your answer\n2. your answer\n…" : "";
  return `Answer all of them in ONE message, one line per item with its number:${example}\nFor gaps, just the missing words are enough. Leave a line empty to skip an item. Ctrl+Enter sends the message.`;
}

/** The first message of a set chat: what to do, every item, and how to answer. */
export function setOpening(intro: string, items: readonly { sentence: string }[]): string {
  return `${intro}\n\n${formatSet(items)}\n\n${answerInstructions(items.length)}`;
}

/** A draft for the composer, one numbered line per item. */
export function answerTemplate(count: number): string {
  return Array.from({ length: count }, (_, i) => `${i + 1}. `).join("\n");
}

// ---------------------------------------------------------------------------
// Parsing the answer message

/** One item's answer and where it sits in the message (to match the correction's mistakes). */
export interface AnswerSpan {
  text: string;
  start: number;
  end: number;
}

interface Segment {
  /** The item number written by the learner, if any (1-based). */
  number: number | null;
  start: number;
  end: number;
  /** Where the line starts, before the number. */
  lineStart?: number;
}

/** "1." "1)" "(1)" "1:" "1 -" "1/6." "#1", optionally after a bullet. */
const MARKER = /^(\s*(?:[-*•]\s*)?(?:#|\()?(\d{1,2})\s*(?:\/\s*\d{1,2}\s*)?[.):\]-](?!\d)\s*)/;
/** A bare number followed by the answer ("2 on"): only taken as a number when it's the expected one. */
const BARE_MARKER = /^(\s*(\d{1,2})\s+)(?=\S)/;
/** A bullet without a number. */
const BULLET = /^(\s*[-*•]\s+)/;
/** Numbers inside a single line: "1. on 2. at 3) in". */
const INLINE_MARKER = /(?:^|\s)(\d{1,2})\s*[.)]\s+/g;
/** What a learner writes for "I don't know". */
const SKIPPED = /^(?:[\s\-–—_?.…x]*|skip(?:ped)?|pass|idk|i don'?t know|don'?t know|no s[eé])$/i;

function lineSegments(text: string, count: number): Segment[] {
  const segments: Segment[] = [];
  let offset = 0;
  let expected = 1;
  for (const line of text.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!line.trim()) continue;

    let number: number | null = null;
    let skip = 0;
    const marker = MARKER.exec(line);
    const bare = BARE_MARKER.exec(line);
    if (marker && Number(marker[2]) >= 1 && Number(marker[2]) <= count) {
      number = Number(marker[2]);
      skip = marker[1].length;
    } else if (bare && Number(bare[2]) === expected && count > 1) {
      number = expected;
      skip = bare[1].length;
    } else {
      const bullet = BULLET.exec(line);
      if (bullet) skip = bullet[1].length;
    }
    expected = (number ?? expected) + 1;
    segments.push({ number, start: lineStart + skip, end: lineStart + line.length, lineStart });
  }
  return segments;
}

/** A single line with numbers inside it, when they count up from 1. */
function inlineSegments(text: string, count: number): Segment[] | null {
  const markers = [...text.matchAll(INLINE_MARKER)]
    .map((m) => ({ number: Number(m[1]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
    .filter((m) => m.number >= 1 && m.number <= count);
  if (markers.length < 2 || markers[0].number !== 1) return null;
  if (markers.some((m, i) => i > 0 && m.number <= markers[i - 1].number)) return null;
  return markers.map((m, i) => ({ number: m.number, start: m.end, end: markers[i + 1]?.start ?? text.length }));
}

/** A single line of short answers separated by commas or semicolons: "on, at, in". */
function listSegments(text: string, count: number): Segment[] | null {
  const pieces: Segment[] = [];
  const pattern = /[^,;]+/g;
  for (const m of text.matchAll(pattern)) pieces.push({ number: null, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  const short = pieces.every((p) => text.slice(p.start, p.end).trim().split(/\s+/).length <= 4);
  return pieces.length === count && short ? pieces : null;
}

/**
 * Splits the learner's message into the answers of a set of `count` items.
 * Tolerant: numbered lines ("1. on", "2) at", "3 - in", "4/6. for") go to their
 * item; unnumbered lines follow the previous one; a single line can hold
 * numbered answers ("1. on 2. at") or a comma-separated list with one short
 * answer per item. Extra lines are ignored. An item without an answer (no
 * line, an empty line, "?", "-", "skip"…) is null.
 */
export function parseAnswers(text: string, count: number): (AnswerSpan | null)[] {
  const answers: (AnswerSpan | null)[] = Array.from({ length: count }, () => null);
  let segments = lineSegments(text, count);
  if (segments.length === 1 && count > 1) {
    const [line] = segments;
    const from = line.lineStart ?? line.start;
    const inline = inlineSegments(text.slice(from, line.end), count);
    const list = line.number === null ? listSegments(text.slice(line.start, line.end), count) : null;
    const offset = inline ? from : line.start;
    const split = inline ?? list;
    if (split) segments = split.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset }));
  }

  let previous = -1;
  for (const segment of segments) {
    const index = segment.number !== null ? segment.number - 1 : previous + 1;
    previous = index;
    if (index >= count) continue;
    const raw = text.slice(segment.start, segment.end);
    const lead = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (SKIPPED.test(value)) continue;
    const start = segment.start + lead;
    answers[index] = { text: value, start, end: start + value.length };
  }
  return answers;
}

// ---------------------------------------------------------------------------
// Matching the correction's mistakes to the answers

/** A mistake found by the correction in the answer message (only ones that count in the stats). */
export interface SetMistake {
  category: ErrorCategory;
  /** The fragment of the message it corrects. */
  original: string;
}

/**
 * The mistakes inside each answer, found by where their fragment sits in the
 * message. Fragments are searched in order (the correction lists them in the
 * order of the text), so a repeated word goes to the right answer. Mistakes
 * that can't be placed are left out.
 */
export function mistakesByAnswer(text: string, answers: readonly (AnswerSpan | null)[], mistakes: readonly SetMistake[]): SetMistake[][] {
  const result: SetMistake[][] = answers.map(() => []);
  const haystack = text.toLowerCase();
  let cursor = 0;
  for (const mistake of mistakes) {
    const needle = mistake.original.trim().toLowerCase();
    if (!needle) continue;
    let at = haystack.indexOf(needle, cursor);
    if (at < 0) at = haystack.indexOf(needle);
    if (at < 0) continue;
    cursor = at + needle.length;
    const index = answers.findIndex((a) => a !== null && at < a.end && at + needle.length > a.start);
    if (index >= 0) result[index].push(mistake);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Grading

export type Mark = "right" | "wrong" | "unknown" | "unanswered";

export interface ItemResult {
  mark: Mark;
  /** Whether a right answer is exactly the expected one (else the expected one is shown as a suggestion). */
  exact: boolean;
  /** What the learner wrote for this item; null when unanswered. */
  learnerAnswer: string | null;
  answer: string;
  why: string;
  /** Extra words for the line: "Right tense (present perfect)", "This one needs the past simple". */
  note: string | null;
}

/** Same answer, ignoring case, punctuation and contractions ("she's" can be "she is" or "she has"). */
export function sameAnswer(a: string, b: string): boolean {
  const variants = (text: string) => [
    comparable(text),
    comparable(text.replace(/\b(it|he|she|that|there|what|who)['’]s\b/gi, "$1 has").replace(/['’]d\b/g, " had")),
  ];
  const left = variants(a);
  return variants(b).some((v) => left.includes(v));
}

/**
 * The full sentence when the learner wrote only the missing words: "have lived"
 * for "I ___ (live) here since 2020." With several gaps, the words are split by
 * "/", "," or "…", or by how many words each gap takes in the expected answer.
 * The text itself when it already follows the sentence; null when it doesn't
 * (a different sentence).
 */
export function completeSentence(sentence: string, text: string, expectedAnswer: string): string | null {
  const { parts } = parseGaps(sentence);
  const gaps = parts.length - 1;
  if (gaps < 1) return null;
  if (gapFills(sentence, text)) return text;

  const expected = gapFills(sentence, expectedAnswer);
  const words = comparable(text).split(" ").filter(Boolean);
  const expectedWords = expected ? expected.join(" ").split(" ").filter(Boolean).length : 1;
  // Too long to be just the missing words: a different sentence.
  if (words.length === 0 || words.length > expectedWords + 2) return null;

  let fills: string[] | null = null;
  if (gaps === 1) fills = [text.trim()];
  else {
    const pieces = text.split(/\s*(?:\/|,|;|\.{2,}|…)\s*/).filter(Boolean);
    if (pieces.length === gaps) fills = pieces;
    else if (expected && words.length === expectedWords) {
      fills = [];
      let at = 0;
      for (const fill of expected) {
        const n = fill.split(" ").filter(Boolean).length;
        fills.push(words.slice(at, at + n).join(" "));
        at += n;
      }
    }
  }
  if (!fills) return null;
  return parts
    .reduce((acc, part, i) => (i === 0 ? part : `${acc} ${fills[i - 1]} ${part}`), "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

const unanswered = (item: { answer: string; why: string }): ItemResult => ({
  mark: "unanswered",
  exact: false,
  learnerAnswer: null,
  answer: item.answer,
  why: item.why,
  note: null,
});

/** Grades a category set (fill in, multiple choice, fix the mistake). */
export function gradeCategorySet(practice: Pick<CategoryPractice, "category" | "items">, text: string, mistakes: readonly SetMistake[]): ItemResult[] {
  const answers = parseAnswers(text, practice.items.length);
  const found = mistakesByAnswer(text, answers, mistakes);
  return practice.items.map((item: CategoryExerciseItem, i) => {
    const answer = answers[i];
    if (!answer) return unanswered(item);
    const check = checkCategoryAnswer(answer.text, item, {
      categoryErrors: found[i].filter((m) => m.category === practice.category).length,
      errors: found[i].length,
    });
    return {
      mark: check === "exact" || check === "right" ? "right" : check,
      exact: check === "exact",
      learnerAnswer: answer.text,
      answer: item.answer,
      why: item.why,
      note: check === "right" ? "No mistakes found" : null,
    };
  });
}

/**
 * Grades a tense set. Contrast: the tense decides (the tense counter on the
 * learner's sentence, rebuilt from the missing words when needed), and a
 * mistake with the verb found by the correction makes it wrong. Form drills:
 * the tense is given, so the words must be the expected ones; when the learner
 * wrote a different sentence, the wrong tense or a mistake with the verb found
 * by the correction makes it wrong.
 */
export function gradeTenseSet(
  practice: Pick<ExercisePractice, "kind" | "tense" | "contrastWith" | "items">,
  text: string,
  mistakes: readonly SetMistake[],
): ItemResult[] {
  const focus = focusTenses(practice);
  const answers = parseAnswers(text, practice.items.length);
  const found = mistakesByAnswer(text, answers, mistakes);
  return practice.items.map((item, i) => {
    const answer = answers[i];
    if (!answer) return unanswered(item);
    const result = (mark: Mark, note: string | null = null, exact = false): ItemResult => ({
      mark,
      exact,
      learnerAnswer: answer.text,
      answer: item.answer,
      why: item.why,
      note,
    });

    const full = completeSentence(item.sentence, answer.text, item.answer);
    if (sameAnswer(full ?? answer.text, item.answer)) return result("right", null, true);

    const check = checkAnswer(full ?? answer.text, item, focus);
    const expected = item.tenses.length > 0 ? item.tenses : tensesAmong(item.answer, focus);
    const needs = expected.map((t) => TENSE_LABELS[t].toLowerCase()).join(" and ");
    const verbErrors = found[i].filter((m) => TENSE_CATEGORIES.includes(m.category)).length;

    if (practice.kind === "form") {
      // The same sentence with other words in the gap, or a mistake with the verb.
      if (full !== null || check === "wrong_tense" || verbErrors > 0) return result("wrong");
      return result("unknown");
    }
    if (check === "wrong_tense") return result("wrong", needs ? `This one needs the ${needs}` : null);
    if (check === "right_tense") {
      // The right tense built wrong ("have already merge") isn't a right answer.
      if (verbErrors > 0) return result("wrong", "Right tense, wrong form");
      return result("right", `Right tense${needs ? ` (${needs})` : ""}`);
    }
    return result("unknown");
  });
}

// ---------------------------------------------------------------------------
// The summary

const indent = (text: string) => `   ${text}`;

/** The fixed reply to the answer message: each item with ✓/✗, the expected answer and why, and the score. */
export function setSummary(results: readonly ItemResult[]): string {
  const lines: string[] = [];
  results.forEach((r, i) => {
    const n = `${i + 1}.`;
    switch (r.mark) {
      case "right":
        lines.push(r.exact ? `${n} ✓ ${r.answer}` : `${n} ✓ ${r.note ?? "Right"}. You wrote: ${r.learnerAnswer} — suggested: ${r.answer}`);
        break;
      case "wrong":
        lines.push(`${n} ✗ You wrote: ${r.learnerAnswer} — ${r.note ? `${r.note}: ` : "answer: "}${r.answer}`);
        break;
      case "unknown":
        lines.push(`${n} ? You wrote: ${r.learnerAnswer} — answer: ${r.answer} (couldn't check this one: compare it yourself)`);
        break;
      case "unanswered":
        lines.push(`${n} – Not answered — answer: ${r.answer}`);
        break;
    }
    if (r.why) lines.push(indent(r.why));
  });

  const right = results.filter((r) => r.mark === "right").length;
  const unknown = results.filter((r) => r.mark === "unknown").length;
  const skipped = results.filter((r) => r.mark === "unanswered").length;
  const notes = [skipped > 0 && `${skipped} not answered`, unknown > 0 && `${unknown} not checked`].filter(Boolean);
  const score = `Score: ${right}/${results.length - unknown}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}.`;
  const missed = results.some((r) => r.mark === "wrong")
    ? " The ones you got wrong are now in your flashcards (Missed exercises)."
    : "";

  return [
    ...lines,
    "",
    score,
    `Your corrections count in the stats as usual.${missed} Start another set from Practice whenever you like.`,
  ].join("\n");
}
