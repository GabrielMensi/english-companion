/**
 * Pure parts of the tense exercise generation: output schema, prompt building
 * and normalization. Kept free of server-only imports so it can be unit tested.
 */
import { z } from "zod";
import { type Tense, TENSE_HINTS, TENSE_LABELS } from "@/lib/taxonomy";
import { countTenses } from "@/lib/tenses-core";
import { type ExerciseItem, type ExerciseKind, focusTenses, tensesAmong } from "@/lib/tense-practice";

export const EXERCISE_COUNT = 6;
/** Fewer usable items than this and the set is rejected (and the next model in the chain tried). */
export const MIN_EXERCISES = 3;

export const exercisesSchema = z.object({
  items: z.array(
    z.object({
      sentence: z.string().describe("The exercise: a sentence with a ___ gap and the base verb in brackets, or a short task."),
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
  "past_simple/present_simple": "yesterday, last night, ago (past) vs every day, usually, always, on Mondays (habits and facts)",
  "present_perfect/present_simple": "since and for with states that are still true (I have lived / I have known) vs habits and general facts",
  "past_continuous/past_simple": "when, while, at 8 pm yesterday (an action in progress, interrupted) vs a completed action or a sequence of actions",
  "present_continuous/present_simple": "now, at the moment, these days, this week (temporary) vs usually, always, every day (habits, permanent facts); stative verbs (know, like, want) are never continuous",
  "future_going_to/future_will": "plans already decided and evidence (look at those clouds) → going to vs decisions made while speaking, promises, offers and predictions based on opinion → will",
  "past_perfect/past_simple": "before, after, by the time, already, when (the earlier of two past actions → past perfect)",
  "present_perfect/present_perfect_continuous": "how long, all day, lately (an activity in progress) vs how many, how much, results (present perfect)",
  "conditional_would/future_will": "unreal or imaginary situations (if I had…, I would…) vs real possibilities (if I have…, I will…)",
  "present_simple/future_will": "after if, when, as soon as, before, until the verb stays in the present simple even about the future",
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
