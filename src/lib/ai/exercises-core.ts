/**
 * Pure parts of the exercise generation (tense exercises and exercises for an
 * error category): output schema, prompt building and normalization. Kept free of server-only imports so it can be unit tested.
 */
import { z } from "@/lib/zod";
import {
  type CategoryExerciseItem,
  categoryDescription,
  type ExerciseFormat,
  formatOf,
  gapFills,
  parseGaps,
  rewriteSource,
} from "@/lib/category-practice";
import { type ErrorCategory, type Tense, TENSE_HINTS, TENSE_LABELS } from "@/lib/taxonomy";
import { SUBTYPES } from "@/lib/subtypes";
import { countTenses } from "@/lib/tenses-core";
import { comparable, type ExerciseItem, type ExerciseKind, focusTenses, tensesAmong } from "@/lib/tense-practice";

export const EXERCISE_COUNT = 6;
/** Fewer usable items than this and the set is rejected (and the next model in the chain tried). */
export const MIN_EXERCISES = 3;

export const exercisesSchema = z.object({
  items: z.array(
    z.object({
      sentence: z
        .string()
        .describe("The exercise: a sentence with a ___ gap and the base verb in brackets, or a short task."),
      answer: z.string().describe("The full correct sentence."),
      why: z.string().describe("One short sentence explaining why that tense."),
    }),
  ),
});

export type RawExercises = z.infer<typeof exercisesSchema>;

export interface ExerciseRequest {
  kind: ExerciseKind;
  tense: Tense;
  contrastWith: Tense | null;
  explanationLanguage: "es" | "en";
  count?: number;
}

/** Time words and context that decide between two tenses often confused by Spanish speakers. */
const CONTRAST_CLUES: Record<string, string> = {
  "past_simple/present_perfect":
    "yesterday, last week, in 2019, ago, when (finished time → past simple) vs since, for, ever, never, just, already, yet, so far, this week, recently (unfinished time or life experience → present perfect)",
  "past_simple/present_simple":
    "yesterday, last night, ago (past) vs every day, usually, always, on Mondays (habits and facts)",
  "present_perfect/present_simple":
    "since and for with states that are still true (I have lived / I have known) vs habits and general facts",
  "past_continuous/past_simple":
    "when, while, at 8 pm yesterday (an action in progress, interrupted) vs a completed action or a sequence of actions",
  "present_continuous/present_simple":
    "now, at the moment, these days, this week (temporary) vs usually, always, every day (habits, permanent facts); stative verbs (know, like, want) are never continuous",
  "future_going_to/future_will":
    "plans already decided and evidence (look at those clouds) → going to vs decisions made while speaking, promises, offers and predictions based on opinion → will",
  "past_perfect/past_simple":
    "before, after, by the time, already, when (the earlier of two past actions → past perfect)",
  "present_perfect/present_perfect_continuous":
    "how long, all day, lately (an activity in progress) vs how many, how much, results (present perfect)",
  "conditional_would/future_will":
    "unreal or imaginary situations (if I had…, I would…) vs real possibilities (if I have…, I will…)",
  "present_simple/future_will":
    "after if, when, as soon as, before, until the verb stays in the present simple even about the future",
};

function contrastClues(a: Tense, b: Tense): string {
  const key = [a, b].sort().join("/");
  return CONTRAST_CLUES[key] ?? "the time expressions and context that decide between them";
}

export function buildExerciseInstructions(input: ExerciseRequest): string {
  const language = input.explanationLanguage === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  const count = input.count ?? EXERCISE_COUNT;
  const label = TENSE_LABELS[input.tense].toLowerCase();
  const other = input.contrastWith ? TENSE_LABELS[input.contrastWith].toLowerCase() : null;

  const common = `You write short English grammar exercises for a native Spanish speaker at B1-B2 level who works as a software developer. Use everyday topics (work, travel, family, hobbies, technology), natural sentences of 6 to 14 words, and varied subjects (I, you, he, she, we, they, names).

Return a JSON object with "items": exactly ${count} items. Each item has:
- sentence: the exercise, as described below.
- answer: the complete correct sentence, with the gap filled in. Only one answer should be natural.
- why: one short sentence in ${language} explaining why that tense is the right one (mention the clue word when there is one).`;

  switch (input.kind) {
    case "contrast":
      return `${common}

The exercises contrast the ${label} (${TENSE_HINTS[input.tense]}) with the ${other} (${other && input.contrastWith ? TENSE_HINTS[input.contrastWith] : ""}).
- sentence: one sentence with a gap written as ___ and the base form of the verb in brackets right after the gap, e.g. "I ___ (live) in Madrid since 2020."
- About half of the items need the ${label} and the other half the ${other}, mixed in random order.
- Each sentence must contain a clue that decides the tense: ${contrastClues(input.tense, input.contrastWith ?? input.tense)}.
- Include some negatives or questions.

Example item: {"sentence": "I ___ (live) in Madrid since 2020.", "answer": "I have lived in Madrid since 2020.", "why": "..."}`;
    case "form":
      return `${common}

The exercises drill the FORM of the ${label} (${TENSE_HINTS[input.tense]}): every answer uses the ${label}.
- sentence: one sentence with a gap written as ___ and the verb in brackets right after the gap; for negatives and questions, put the hint in brackets too, e.g. "She ___ (not / finish) the report yet." or "___ you ever ___ (be) to Japan?"
- Mix affirmative sentences, negatives and questions, third person singular, and irregular verbs (go, write, see, take, buy, eat, forget).

Example item: {"sentence": "He ___ (not / write) the tests yet.", "answer": "He hasn't written the tests yet.", "why": "..."}`;
    case "use":
      return `${common}

The exercises make the learner USE the ${label} (${TENSE_HINTS[input.tense]}) in their own sentences, because they rarely use it.
- sentence: a short task or question, addressed to the learner, that is only natural to answer with the ${label}. No gaps. E.g. "Write about something you had already done before 9 am yesterday."
- answer: an example answer, a full sentence in the ${label}.

Example item: {"sentence": "Write about a skill you have learned this year.", "answer": "I have learned how to write unit tests this year.", "why": "..."}`;
  }
}

export function buildExercisePrompt(input: ExerciseRequest): string {
  const count = input.count ?? EXERCISE_COUNT;
  return `Write ${count} new exercises. Don't reuse the example sentences.`;
}

const GAP = /_{2,}|…{1,}|\.{3,}/g;

/**
 * Drops items small models commonly get wrong: missing gap, unfilled answer,
 * duplicates, or an answer in a tense that isn't being practiced. Also works
 * out which practiced tenses each answer needs, to check the learner's answer.
 */
export function normalizeExercises(raw: RawExercises, request: ExerciseRequest): ExerciseItem[] {
  const count = request.count ?? EXERCISE_COUNT;
  const focus = focusTenses(request);
  const seen = new Set<string>();
  const items: ExerciseItem[] = [];

  for (const item of raw.items) {
    const sentence = item.sentence.trim().replace(GAP, "___").replace(/\s+/g, " ");
    const answer = item.answer.trim().replace(/\s+/g, " ");
    const why = item.why.trim();
    if (!sentence || !answer) continue;
    if (request.kind !== "use" && !sentence.includes("___")) continue;
    if (/_{2,}/.test(answer) || answer.toLowerCase() === sentence.toLowerCase()) continue;

    const tenses = tensesAmong(answer, focus);
    // The counter found verbs, but none in a practiced tense: the model drifted.
    if (tenses.length === 0 && Object.keys(countTenses(answer)).length > 0) continue;

    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ sentence, answer, why, tenses });
    if (items.length === count) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Exercises for an error category (the weakest categories of the dashboard)

/** Like {@link exercisesSchema}, plus the options of multiple choice items in their own field (small models leave them out of the sentence). */
export const categoryExercisesSchema = z.object({
  items: z.array(
    z.object({
      sentence: z
        .string()
        .describe('The exercise: a sentence with a ___ gap, or "Fix the mistake: " and a sentence with one mistake.'),
      options: z
        .string()
        .describe('Multiple choice only: 2 or 3 options for the gap separated by " / ". Empty for the other formats.'),
      answer: z.string().describe("The full correct sentence, with the gap filled in."),
      why: z.string().describe("One short sentence explaining the rule."),
    }),
  ),
});

export type RawCategoryExercises = z.infer<typeof categoryExercisesSchema>;

export interface CategoryExerciseRequest {
  category: ErrorCategory;
  subtype: string | null;
  explanationLanguage: "es" | "en";
  /** Real mistakes of the learner in this category, as material: "original → correction". */
  mistakes?: { original: string; correction: string }[];
  count?: number;
}

/** How many items of each format a set of `count` asks for: fill, choice, then rewrite. */
function formatCounts(count: number): Record<ExerciseFormat, number> {
  const rewrite = Math.max(1, Math.floor(count / 3));
  const choice = Math.max(1, Math.floor((count - rewrite) / 2));
  return { fill: count - rewrite - choice, choice, rewrite };
}

export function buildCategoryExerciseInstructions(input: CategoryExerciseRequest): string {
  const language = input.explanationLanguage === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  const count = input.count ?? EXERCISE_COUNT;
  const n = formatCounts(count);
  const subtype = input.subtype ? SUBTYPES[input.category][input.subtype] : null;
  const points = Object.entries(SUBTYPES[input.category])
    .filter(([key]) => key !== "other")
    .map(([, info]) => `- ${info.label}: ${info.hint}`)
    .join("\n");
  const focus = subtype
    ? `Focus on this type of mistake: ${subtype.label} (${subtype.hint}).`
    : points
      ? `Cover several of these types of mistakes:\n${points}`
      : "";
  const mistakes = (input.mistakes ?? []).slice(0, 6);
  const material =
    mistakes.length > 0
      ? `\n\nMistakes the learner actually made (original → correction). Test the same points in new sentences; rewrite items may reuse one of these sentences:\n${mistakes.map((m) => `- "${m.original}" → "${m.correction}"`).join("\n")}`
      : "";

  return `You write short English grammar exercises for a native Spanish speaker at B1-B2 level who works as a software developer. Use everyday topics (work, travel, family, hobbies, technology), natural sentences of 6 to 14 words, and varied subjects (I, you, he, she, we, they, names).

The exercises practice ${categoryDescription(input.category)}. ${focus}${material}

Return a JSON object with "items": exactly ${count} items, in this order: ${n.fill} fill-in-the-gap, ${n.choice} multiple choice, ${n.rewrite} fix-the-mistake. Each item has:
- sentence: the exercise, as described below.
- options: only for multiple choice, the options for the gap separated by " / " (one right, the others the mistakes a Spanish speaker would make). An empty string for the other formats.
- answer: the complete correct sentence, with the gap filled in: never ___. Only one answer should be natural.
- why: one short sentence in ${language} explaining the rule.

Formats:
- fill-in-the-gap: one sentence with one gap written as ___ where a word is missing. The gap is never empty in the answer. E.g. {"sentence": "My sister is ___ engineer at Google.", "options": "", "answer": "My sister is an engineer at Google.", "why": "..."}
- multiple choice: one sentence with one gap written as ___, and 2 or 3 options in "options". The answer uses exactly one of the options. E.g. {"sentence": "It depends ___ the weather.", "options": "of / on / in", "answer": "It depends on the weather.", "why": "..."}
- fix-the-mistake: "Fix the mistake: " followed by a sentence with exactly one mistake of this kind, the kind a Spanish speaker makes. No gaps. E.g. {"sentence": "Fix the mistake: I am agree with you.", "options": "", "answer": "I agree with you.", "why": "..."}`;
}

export function buildCategoryExercisePrompt(input: CategoryExerciseRequest): string {
  return `Write ${input.count ?? EXERCISE_COUNT} new exercises. Don't reuse the example sentences.`;
}

/**
 * Drops items small models commonly get wrong: an answer that doesn't follow
 * the gapped sentence, an empty gap, a choice answer that isn't one of the
 * options, a "mistake" that is already correct, and duplicates.
 */
export function normalizeCategoryExercises(
  raw: RawCategoryExercises,
  request: CategoryExerciseRequest,
): CategoryExerciseItem[] {
  const count = request.count ?? EXERCISE_COUNT;
  const seen = new Set<string>();
  const items: CategoryExerciseItem[] = [];

  for (const item of raw.items) {
    let sentence = item.sentence.trim().replace(GAP, "___").replace(/\s+/g, " ");
    // The options go right after the only gap, unless the sentence already has them.
    const options = (item.options ?? "")
      .split("/")
      .map((o) => o.trim())
      .filter(Boolean);
    if (options.length > 1 && sentence.split("___").length === 2 && !/___\s*\(/.test(sentence)) {
      sentence = sentence.replace("___", `___ (${options.join(" / ")})`);
    }
    const answer = item.answer.trim().replace(/\s+/g, " ");
    const why = item.why.trim();
    if (!sentence || !answer || /_{2,}/.test(answer)) continue;

    const format = formatOf(sentence);
    if (format === "rewrite") {
      const source = rewriteSource(sentence);
      if (!source || comparable(source) === comparable(answer)) continue;
    } else {
      const fills = gapFills(sentence, answer);
      if (!fills || fills.some((f) => !f)) continue;
      if (format === "choice") {
        const { options } = parseGaps(sentence);
        const valid = fills.every((f, i) => options[i].length === 0 || options[i].some((o) => comparable(o) === f));
        if (!valid) continue;
      }
    }

    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ sentence, answer, why, format });
    if (items.length === count) break;
  }
  return items;
}
