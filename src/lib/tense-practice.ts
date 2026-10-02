/**
 * Pure parts of the verb tense practice (see docs/VERB_TENSES.md): which tenses
 * to practice, based on the per-tense diagnosis; conversation questions that
 * need each tense; and the feedback shown after each exercise answer. Kept free
 * of server-only imports so it can be unit tested.
 */
import { type Tense, TENSE_HINTS, TENSE_LABELS } from "@/lib/taxonomy";
import type { TenseStat, TenseStatus } from "@/lib/tense-stats";
import { countTenses } from "@/lib/tenses-core";

/**
 * - contrast: choose between the tense and the one used instead (yesterday / since / ever / just).
 * - form: conjugation drill, when the tense is chosen right but built wrong ("have wrote", "he don't").
 * - use: write sentences that need a tense the learner barely uses.
 */
export const EXERCISE_KINDS = ["contrast", "form", "use"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export interface PracticeTarget {
  tense: Tense;
  /** The tense most often used instead; only for contrast exercises. */
  contrastWith: Tense | null;
  /** The exercise that fits the problem best. */
  kind: ExerciseKind;
  /** "suggested" when there isn't enough data yet and it's a common problem for Spanish speakers. */
  status: TenseStatus | "suggested";
  /** One line for the UI explaining why this tense was picked. */
  reason: string;
}

/** Added to the number of mistakes when ranking: weak and rarely used tenses go first. */
const STATUS_BONUS: Record<TenseStatus, number> = { weak: 5, avoided: 4, shaky: 2, not_enough_data: 0, strong: 0 };
/** Mistakes needed to practice a tense that doesn't have enough uses to get a status yet. */
const MIN_ERRORS_WITHOUT_STATUS = 2;

/** The classic problems for Spanish speakers, offered while there's no data to pick from. */
export const SUGGESTED_TARGETS: PracticeTarget[] = [
  {
    tense: "present_perfect",
    contrastWith: "past_simple",
    kind: "contrast",
    status: "suggested",
    reason: "A classic for Spanish speakers: “I have lived here since 2020”, not “I live here since 2020” or “I lived”.",
  },
  {
    tense: "past_continuous",
    contrastWith: "past_simple",
    kind: "contrast",
    status: "suggested",
    reason: "Telling stories: “I was cooking when you called”.",
  },
  {
    tense: "future_going_to",
    contrastWith: "future_will",
    kind: "contrast",
    status: "suggested",
    reason: "Plans vs decisions made on the spot: “I’m going to visit my parents” vs “I’ll get it”.",
  },
];

/**
 * Picks the tenses worth practicing from the per-tense stats: weak and rarely
 * used tenses first, then the ones with the most mistakes. Each gets the kind of
 * exercise that fits: contrast with the tense used instead when the problem is
 * choosing it, a form drill when it's building it, and "use" when it's avoided.
 * Falls back to {@link SUGGESTED_TARGETS} when nothing stands out.
 */
export function selectPracticeTargets(stats: readonly TenseStat[], limit = 3): PracticeTarget[] {
  const candidates = stats
    .map((stat) => ({ stat, errors: stat.usageErrors + stat.formErrors }))
    .filter(({ stat, errors }) => {
      if (stat.status === "strong") return false;
      if (stat.status === "not_enough_data") return errors >= MIN_ERRORS_WITHOUT_STATUS;
      // "Getting there" without a single mistake has nothing specific to practice.
      return stat.status !== "shaky" || errors > 0;
    })
    .map(({ stat, errors }) => ({ stat, score: errors + STATUS_BONUS[stat.status] }))
    .sort((a, b) => b.score - a.score || a.stat.smoothedAccuracy - b.stat.smoothedAccuracy);

  const targets: PracticeTarget[] = [];
  const pairs = new Set<string>();
  for (const { stat } of candidates) {
    const target = toTarget(stat);
    // "Past simple instead of present perfect" and the other way round are the same exercise.
    if (target.contrastWith) {
      const pair = [target.tense, target.contrastWith].sort().join("/");
      if (pairs.has(pair)) continue;
      pairs.add(pair);
    }
    targets.push(target);
    if (targets.length === limit) break;
  }

  // Suggestions only fill an empty list: with real data, a short list is the honest answer.
  return targets.length > 0 ? targets : SUGGESTED_TARGETS.slice(0, limit);
}

function toTarget(stat: TenseStat): PracticeTarget {
  const accuracy = stat.accuracy !== null ? `${Math.round(stat.accuracy)}% accuracy · ` : "";
  const confusion = stat.confusedWith[0];

  if (stat.status === "avoided" && stat.usageErrors + stat.formErrors === 0) {
    return {
      tense: stat.tense,
      contrastWith: null,
      kind: "use",
      status: stat.status,
      reason: `${TENSE_LABELS[stat.tense]} barely shows up in what you write (${stat.uses === 1 ? "once" : `${stat.uses} times`} in this period). Using it on purpose is how it sticks.`,
    };
  }
  if (confusion && stat.usageErrors >= stat.formErrors) {
    return {
      tense: stat.tense,
      contrastWith: confusion.tense,
      kind: "contrast",
      status: stat.status,
      reason: `${accuracy}you used the ${TENSE_LABELS[confusion.tense].toLowerCase()} instead ${times(confusion.count)} (“${confusion.example.original}” → “${confusion.example.correction}”).`,
    };
  }
  return {
    tense: stat.tense,
    contrastWith: null,
    kind: "form",
    status: stat.status,
    reason: `${accuracy}${stat.formErrors} ${stat.formErrors === 1 ? "mistake" : "mistakes"} building it (the right tense, the wrong form).`,
  };
}

function times(n: number) {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

/** Title for a practice chat. */
export function practiceTitle(practice: { kind: ExerciseKind | "conversation"; tense: Tense; contrastWith: Tense | null }) {
  const label = TENSE_LABELS[practice.tense];
  switch (practice.kind) {
    case "contrast":
      return practice.contrastWith
        ? `Practice: ${label.toLowerCase()} vs ${TENSE_LABELS[practice.contrastWith].toLowerCase()}`
        : `Practice: ${label.toLowerCase()}`;
    case "form":
      return `Practice: ${label.toLowerCase()} (forms)`;
    case "use":
      return `Practice: using the ${label.toLowerCase()}`;
    case "conversation":
      return `Talk: ${label.toLowerCase()}`;
  }
}

// ---------------------------------------------------------------------------
// Targeted conversation

/**
 * Questions that are only natural to answer with each tense. They open a
 * practice conversation and show the model the kind of follow-up to ask.
 */
export const TENSE_QUESTIONS: Record<Tense, readonly string[]> = {
  present_simple: [
    "What does a normal workday look like for you?",
    "What do you usually do on weekends?",
    "How often do you cook at home, and what do you usually make?",
  ],
  present_continuous: [
    "What are you working on these days?",
    "What’s happening around you right now?",
    "Are you learning anything new at the moment, apart from English?",
  ],
  past_simple: [
    "What did you do last weekend?",
    "Where did you go on your last holiday, and what did you do there?",
    "What was the last film or series you watched? Did you like it?",
  ],
  past_continuous: [
    "What were you doing yesterday at 8 pm?",
    "What were you doing when you heard some big news recently?",
    "Think of a time something unexpected happened. What were you doing when it happened?",
  ],
  present_perfect: [
    "What have you done this week that you haven’t done before?",
    "Have you ever been somewhere that surprised you? Where?",
    "What’s something you’ve always wanted to do but haven’t done yet?",
  ],
  present_perfect_continuous: [
    "What have you been working on lately?",
    "How long have you been learning English, and how has it been going?",
    "What have you been doing to relax recently?",
  ],
  past_perfect: [
    "Tell me about a day when something went wrong. What had you done (or not done) before it happened?",
    "When you started your current job, what had you already learned before?",
    "Have you ever arrived somewhere and realized you had forgotten something important? What happened?",
  ],
  past_perfect_continuous: [
    "Think of a time you finally got something you wanted. How long had you been waiting for it?",
    "When you last changed jobs or projects, what had you been doing before?",
    "Before you started learning English seriously, what had you been trying?",
  ],
  future_will: [
    "How do you think your job will change in the next ten years?",
    "What do you think you’ll be good at in five years?",
    "Do you think AI will replace programmers? Why or why not?",
  ],
  future_going_to: [
    "What are you going to do this weekend?",
    "What are you going to work on next month?",
    "Are you going to travel anywhere this year? What are you going to do there?",
  ],
  future_present_continuous: [
    "What are you doing tomorrow evening? Have you made any plans?",
    "Who are you meeting this week?",
    "What are you doing for your next holiday? Is it already booked?",
  ],
  future_continuous: [
    "What will you be doing this time tomorrow?",
    "Imagine it’s ten years from now. What will you be doing on a typical Monday?",
    "What will you be working on next week while I’m waiting for your answer?",
  ],
  future_perfect: [
    "What will you have finished by the end of this year?",
    "By the time you’re 50, what will you have achieved?",
    "How many books do you think you’ll have read by December?",
  ],
  used_to_would: [
    "What did you use to do as a child that you don’t do anymore?",
    "What games would you play with your friends when you were a kid?",
    "What did you use to believe that you don’t believe now?",
  ],
  conditional_would: [
    "What would you do if you didn’t have to work?",
    "If you could live in any city in the world, where would you live and why?",
    "What would you have done differently if you had started programming earlier?",
  ],
};

/** A question for the tense, different from the ones already asked when possible. */
export function pickQuestion(tense: Tense, asked: readonly string[] = [], random = Math.random): string {
  const questions = TENSE_QUESTIONS[tense];
  const fresh = questions.filter((q) => !asked.includes(q));
  const pool = fresh.length > 0 ? fresh : questions;
  return pool[Math.floor(random() * pool.length)];
}

/** Extra reply rule for a practice conversation, so every follow-up question needs the tense. */
export function conversationPracticeRule(tense: Tense): string {
  const label = TENSE_LABELS[tense].toLowerCase();
  const examples = TENSE_QUESTIONS[tense].map((q) => `"${q}"`).join(", ");
  return `This is a practice conversation: the learner wants to practice the ${label} (${TENSE_HINTS[tense]}). Always end your reply with ONE follow-up question that is only natural to answer with the ${label}, like ${examples} (write your own, don't copy these). Vary the topic, follow what the learner said, and never mention grammar or tenses.`;
}

// ---------------------------------------------------------------------------
// Exercises

/** One exercise item. For contrast and form, `sentence` has a gap: "I ___ (live) here since 2020." */
export interface ExerciseItem {
  sentence: string;
  /** The full correct sentence. */
  answer: string;
  /** Why that tense, in the explanation language. */
  why: string;
  /** Tenses the answer needs, among the ones practiced; empty when the counter can't tell. */
  tenses: Tense[];
}

export interface ExercisePractice {
  kind: ExerciseKind;
  tense: Tense;
  contrastWith: Tense | null;
  items: ExerciseItem[];
}

/**
 * The counter can't tell "I'm meeting him tomorrow" from "I'm meeting him now"
 * (the same simplification as the tense stats).
 */
const measured = (tense: Tense): Tense => (tense === "future_present_continuous" ? "present_continuous" : tense);

/** The tenses being practiced, as the counter sees them. */
export function focusTenses(practice: Pick<ExercisePractice, "tense" | "contrastWith">): Tense[] {
  return [...new Set([practice.tense, practice.contrastWith].filter((t): t is Tense => t !== null).map(measured))];
}

/** Tenses of a text, as the counter sees them. */
function measuredTenses(text: string): Tense[] {
  return [...new Set((Object.keys(countTenses(text)) as Tense[]).map(measured))];
}

/** Tenses of a text among the practiced ones. */
export function tensesAmong(text: string, focus: readonly Tense[]): Tense[] {
  const found = measuredTenses(text);
  return focus.filter((t) => found.includes(t));
}

export type AnswerCheck = "exact" | "right_tense" | "wrong_tense" | "unknown";

/**
 * Compares the learner's answer with the expected one. "exact" ignores case,
 * punctuation and contractions. Otherwise it compares the practiced tenses in
 * both (other mistakes are the correction pipeline's job). "unknown" when the
 * counter finds none of the practiced tenses in the answer or the expected one.
 */
export function checkAnswer(learnerText: string, item: ExerciseItem, focus: readonly Tense[]): AnswerCheck {
  if (comparable(learnerText) === comparable(item.answer)) return "exact";
  const expected = item.tenses.length > 0 ? item.tenses : tensesAmong(item.answer, focus);
  // Every tense in the answer, not only the practiced ones: "I live here since…" is wrong too.
  const used = measuredTenses(learnerText);
  if (expected.length === 0 || used.length === 0) return "unknown";
  const extra = used.filter((t) => focus.includes(t) && !expected.includes(t));
  return expected.every((t) => used.includes(t)) && extra.length === 0 ? "right_tense" : "wrong_tense";
}

const EXPANSIONS: [RegExp, string][] = [
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "cannot"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/\bi'm\b/g, "i am"],
  [/\b(it|he|she|that|there|what|who)'s\b/g, "$1 is"],
];

function comparable(text: string): string {
  let result = text.toLowerCase().replace(/[’‘]/g, "'");
  for (const [pattern, replacement] of EXPANSIONS) result = result.replace(pattern, replacement);
  return result
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What the learner is asked to do, shown with the first item. */
export function exerciseIntro(practice: Pick<ExercisePractice, "kind" | "tense" | "contrastWith" | "items">): string {
  const label = TENSE_LABELS[practice.tense].toLowerCase();
  const n = practice.items.length;
  switch (practice.kind) {
    case "contrast": {
      const other = practice.contrastWith ? TENSE_LABELS[practice.contrastWith].toLowerCase() : "another tense";
      return `Let’s practice the ${label} vs the ${other}: ${n} sentences. Write each full sentence with the right form of the verb in brackets. Watch the time words (yesterday, since, ever, just…).`;
    }
    case "form":
      return `Let’s practice building the ${label} (${TENSE_HINTS[practice.tense]}): ${n} sentences. Write each full sentence with the verb in brackets in the ${label}.`;
    case "use":
      return `Let’s practice using the ${label} (${TENSE_HINTS[practice.tense]}): ${n} short tasks. Answer each one with a full sentence about you.`;
  }
}

export function formatItem(item: ExerciseItem, index: number, total: number): string {
  return `${index + 1}/${total}. ${item.sentence}`;
}

/** The first message of an exercise chat. */
export function exerciseOpening(practice: ExercisePractice): string {
  return `${exerciseIntro(practice)}\n\n${formatItem(practice.items[0], 0, practice.items.length)}`;
}

/**
 * The reply to the learner's answer to item `index`: whether the tense was
 * right, the expected answer and why, then the next item (or a summary at the
 * end). Null past the last item: from there on it's a normal correction chat.
 * `previousChecks` are the checks of the earlier answers, for the final score.
 */
export function exerciseReply(input: {
  practice: ExercisePractice;
  index: number;
  learnerText: string;
  previousChecks: AnswerCheck[];
}): { text: string; check: AnswerCheck } | null {
  const { practice, index } = input;
  const item = practice.items[index];
  if (!item) return null;

  const focus = focusTenses(practice);
  const check = checkAnswer(input.learnerText, item, focus);
  const expected = item.tenses.length > 0 ? item.tenses : tensesAmong(item.answer, focus);
  const needs = expected.map((t) => TENSE_LABELS[t].toLowerCase()).join(" and ");

  const lines: string[] = [];
  if (check === "exact") lines.push("✓ Correct!");
  // In a form drill the tense is given: what matters is how it's built, and the correction shows that.
  else if (practice.kind === "form" || check === "unknown") {
    lines.push(`${practice.kind === "use" ? "Example" : "Answer"}: ${item.answer}`);
  } else if (check === "right_tense") lines.push(`✓ Right tense${needs ? ` (${needs})` : ""}. Suggested answer: ${item.answer}`);
  else lines.push(`✗ This one needs the ${needs}: ${item.answer}`);
  if (item.why) lines.push(item.why);

  const next = practice.items[index + 1];
  if (next) {
    lines.push("", formatItem(next, index + 1, practice.items.length));
  } else {
    const checks = [...input.previousChecks, check];
    const graded = checks.filter((c) => c !== "unknown");
    const score =
      practice.kind === "form"
        ? `: exactly right in ${checks.filter((c) => c === "exact").length} of ${checks.length}`
        : practice.kind === "contrast" && graded.length > 0
          ? `: the right tense in ${graded.filter((c) => c !== "wrong_tense").length} of ${graded.length}`
          : "";
    lines.push(
      "",
      `That’s the whole set${score}. Your corrections count in the stats as usual. Start another set from Practice whenever you like.`,
    );
  }
  return { text: lines.join("\n"), check };
}
