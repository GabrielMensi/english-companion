import "server-only";

import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { InputMode, Message } from "@/db/schema";
import {
  type AnswerSignals,
  type CategoryCheck,
  categoryExerciseReply,
  type CategoryPractice,
  categoryTopic,
  checkCategoryAnswer,
  EXERCISE_FORMATS,
} from "@/lib/category-practice";
import { getSettings } from "@/lib/settings";
import {
  countsInStats,
  ERROR_CATEGORIES,
  type ErrorCategory,
  type Severity,
  type Tense,
  TENSE_CATEGORIES,
  TENSES,
} from "@/lib/taxonomy";
import {
  type AnswerCheck,
  checkAnswer,
  conversationPracticeRule,
  EXERCISE_KINDS,
  type ExercisePractice,
  exerciseReply,
  focusTenses,
  isTenseMiss,
  practiceTopic,
} from "@/lib/tense-practice";

/**
 * What a practice chat is practicing. Stored in the key-value `settings` table
 * (key `practice:<session id>`) instead of a new column, so the feature needs
 * no migration. Chats without an entry are normal chats.
 */
const tense = z.enum(TENSES);
const practiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), tense }),
  z.object({
    kind: z.enum(EXERCISE_KINDS),
    tense,
    contrastWith: tense.nullable(),
    items: z.array(
      z.object({ sentence: z.string(), answer: z.string(), why: z.string(), tenses: z.array(tense) }),
    ),
  }),
  // Exercises for one of the weakest error categories (src/lib/category-practice.ts).
  z.object({
    kind: z.literal("category"),
    category: z.enum(ERROR_CATEGORIES),
    subtype: z.string().nullable(),
    items: z.array(
      z.object({ sentence: z.string(), answer: z.string(), why: z.string(), format: z.enum(EXERCISE_FORMATS) }),
    ),
  }),
]);

export type Practice = z.infer<typeof practiceSchema>;

const keyOf = (sessionId: string) => `practice:${sessionId}`;

export function getPractice(sessionId: string): Practice | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, keyOf(sessionId))).get();
  if (!row) return null;
  const parsed = practiceSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

export function savePractice(sessionId: string, practice: Practice) {
  db.insert(schema.settings)
    .values({ key: keyOf(sessionId), value: practice })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: practice } })
    .run();
}

export function deletePractice(sessionId: string) {
  db.delete(schema.settings).where(eq(schema.settings.key, keyOf(sessionId))).run();
}

/** Extra instruction for the conversation reply, so follow-up questions need the practiced tense. */
export function practiceReplyRule(practice: Practice | null): string | undefined {
  return practice?.kind === "conversation" ? conversationPracticeRule(practice.tense) : undefined;
}

/** A mistake found by the correction pipeline, as much as the exercise checks need. */
export interface FoundMistake {
  category: ErrorCategory;
  severity: Severity;
}

/** An item the learner got wrong, to save for spaced review (src/lib/missed-exercises.ts). */
export interface MissedItem {
  topic: string;
  category: ErrorCategory | null;
  subtype: string | null;
  tense: Tense | null;
  sentence: string;
  answer: string;
  why: string;
  learnerAnswer: string;
}

export interface ExerciseTurn {
  /** The fixed reply: feedback and the next item. */
  text: string;
  /** The item this answer answers. */
  index: number;
  /** Set when the answer was wrong. */
  missed: MissedItem | null;
}

/**
 * In an exercise chat, the reply to a learner's answer: feedback and the next
 * item, plus whether the item was missed. The n-th analyzed answer in the chat
 * answers the n-th item, so retrying a message gives the same reply. `mistakes`
 * are what the correction found in this answer. Null outside exercise chats and
 * after the last item.
 */
export function exerciseReplyFor(
  practice: Practice | null,
  message: Message,
  mistakes: readonly FoundMistake[],
): ExerciseTurn | null {
  if (!practice || practice.kind === "conversation") return null;

  const earlier = db
    .select({ id: schema.messages.id, content: schema.messages.content, inputMode: schema.messages.inputMode })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.sessionId, message.sessionId),
        eq(schema.messages.role, "user"),
        eq(schema.messages.status, "done"),
        lt(schema.messages.createdAt, message.createdAt),
      ),
    )
    .orderBy(asc(schema.messages.createdAt))
    .all();
  const index = earlier.length;
  const item = practice.items[index];
  if (!item) return null;

  // Only mistakes that count in the stats decide whether an answer is wrong.
  const { countTyposInStats } = getSettings();
  const counted = (found: readonly FoundMistake[], inputMode: InputMode) =>
    found.filter((m) => countsInStats({ ...m, inputMode }, countTyposInStats));
  const answered = earlier.slice(0, practice.items.length);
  const earlierMistakes = mistakesOf(answered.map((m) => m.id));
  const previous = answered.map((m) => ({ ...m, mistakes: counted(earlierMistakes.get(m.id) ?? [], m.inputMode) }));
  const current = counted(mistakes, message.inputMode);

  if (practice.kind === "category") {
    const signals = (found: FoundMistake[]): AnswerSignals => ({
      categoryErrors: found.filter((m) => m.category === practice.category).length,
      errors: found.length,
    });
    const previousChecks: CategoryCheck[] = previous.map((m, i) =>
      checkCategoryAnswer(m.content, practice.items[i], signals(m.mistakes)),
    );
    const result = categoryExerciseReply({
      practice: practice satisfies CategoryPractice,
      index,
      learnerText: message.content,
      signals: signals(current),
      previousChecks,
    });
    if (!result) return null;
    const missed: MissedItem | null =
      result.check === "wrong"
        ? {
            topic: categoryTopic(practice),
            category: practice.category,
            subtype: practice.subtype,
            tense: null,
            sentence: item.sentence,
            answer: item.answer,
            why: item.why,
            learnerAnswer: message.content,
          }
        : null;
    return { text: result.text, index, missed };
  }

  const exercise: ExercisePractice = practice;
  const focus = focusTenses(exercise);
  const verbErrors = (found: FoundMistake[]) => found.filter((m) => TENSE_CATEGORIES.includes(m.category)).length;
  const previousChecks: AnswerCheck[] = previous.map((m, i) => checkAnswer(m.content, exercise.items[i], focus));
  const check = checkAnswer(message.content, exercise.items[index], focus);
  const isMissed = isTenseMiss(exercise.kind, check, verbErrors(current));
  const missedAny =
    isMissed || previous.some((m, i) => isTenseMiss(exercise.kind, previousChecks[i], verbErrors(m.mistakes)));

  const result = exerciseReply({
    practice: exercise,
    index,
    learnerText: message.content,
    previousChecks,
    missedAny,
  });
  if (!result) return null;
  const missed: MissedItem | null = isMissed
    ? {
        topic: practiceTopic(exercise),
        category: null,
        subtype: null,
        tense: exercise.tense,
        sentence: exercise.items[index].sentence,
        answer: exercise.items[index].answer,
        why: exercise.items[index].why,
        learnerAnswer: message.content,
      }
    : null;
  return { text: result.text, index, missed };
}

/** The corrections of each message. */
function mistakesOf(messageIds: string[]): Map<string, FoundMistake[]> {
  const map = new Map<string, FoundMistake[]>();
  if (messageIds.length === 0) return map;
  const rows = db
    .select({
      messageId: schema.corrections.messageId,
      category: schema.corrections.category,
      severity: schema.corrections.severity,
    })
    .from(schema.corrections)
    .where(inArray(schema.corrections.messageId, messageIds))
    .all();
  for (const { messageId, ...mistake } of rows) map.set(messageId, [...(map.get(messageId) ?? []), mistake]);
  return map;
}
