import "server-only";

import { asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import type { Message } from "@/db/schema";
import { categoryTopic, EXERCISE_FORMATS } from "@/lib/category-practice";
import { gradeCategorySet, gradeTenseSet, setSummary } from "@/lib/exercise-set";
import { getSettings } from "@/lib/settings";
import { countsInStats, ERROR_CATEGORIES, type ErrorCategory, type Severity, type Tense, TENSES } from "@/lib/taxonomy";
import { conversationPracticeRule, EXERCISE_KINDS, exerciseReply, practiceTopic } from "@/lib/tense-practice";
import { topicRule } from "@/lib/topics";
import { deleteUserSetting, getUserSetting, listUserSettings, setUserSetting } from "@/lib/user-settings";

/**
 * What a practice chat is practicing. Stored in the user's key-value `user_settings`
 * table (key `practice:<session id>`) instead of a new column, so the feature needs
 * no migration. Chats without an entry are normal chats.
 */
const tense = z.enum(TENSES);
const practiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), tense }),
  // A conversation about a topic the learner chose (src/lib/topics.ts). Normal writing, not practice.
  z.object({ kind: z.literal("topic"), preset: z.string().nullable(), topic: z.string() }),
  z.object({
    kind: z.enum(EXERCISE_KINDS),
    tense,
    contrastWith: tense.nullable(),
    items: z.array(z.object({ sentence: z.string(), answer: z.string(), why: z.string(), tenses: z.array(tense) })),
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

export function getPractice(userId: string, sessionId: string): Practice | null {
  const value = getUserSetting(userId, keyOf(sessionId));
  if (value === undefined) return null;
  const parsed = practiceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * How each chat is labeled in the sidebar and on the home page: practice
 * sessions (exercises or a guided conversation), and topic conversations with their topic.
 */
export function chatLabels(userId: string): Map<string, { practice: boolean; topic: string | null }> {
  const rows = listUserSettings(userId, keyOf(""));
  const labels = new Map<string, { practice: boolean; topic: string | null }>();
  for (const row of rows) {
    const parsed = practiceSchema.safeParse(row.value);
    if (!parsed.success) continue;
    const practice = parsed.data;
    labels.set(row.key.slice(keyOf("").length), {
      practice: practice.kind !== "topic",
      topic: practice.kind === "topic" ? practice.topic : null,
    });
  }
  return labels;
}

export function savePractice(userId: string, sessionId: string, practice: Practice) {
  setUserSetting(userId, keyOf(sessionId), practice);
}

export function deletePractice(userId: string, sessionId: string) {
  deleteUserSetting(userId, keyOf(sessionId));
}

/** Extra instruction for the conversation reply: follow-up questions that need the practiced tense, or stay on the topic. */
export function practiceReplyRule(practice: Practice | null): string | undefined {
  if (practice?.kind === "conversation") return conversationPracticeRule(practice.tense);
  if (practice?.kind === "topic") return topicRule(practice);
  return undefined;
}

/** A mistake found by the correction pipeline, as much as the exercise checks need. */
export interface FoundMistake {
  category: ErrorCategory;
  severity: Severity;
  /** The fragment of the message it corrects. */
  original: string;
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
  /** The fixed reply: the results of the set, or feedback and the next task. */
  text: string;
  /** Each graded item (its index in the set) and whether it was missed. */
  outcomes: { index: number; missed: MissedItem | null }[];
}

/** Practices whose whole set is shown at once and answered in one message. */
export type SetPractice = Extract<Practice, { kind: "category" | "contrast" | "form" }>;

export function isSetPractice(practice: Practice | null): practice is SetPractice {
  return (
    practice !== null && (practice.kind === "category" || practice.kind === "contrast" || practice.kind === "form")
  );
}

/** The learner's earlier analyzed messages in the chat, oldest first. */
function earlierAnswers(userId: string, message: Message) {
  return db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      owned(
        schema.messages,
        userId,
        eq(schema.messages.sessionId, message.sessionId),
        eq(schema.messages.role, "user"),
        eq(schema.messages.status, "done"),
        lt(schema.messages.createdAt, message.createdAt),
      ),
    )
    .orderBy(asc(schema.messages.createdAt))
    .all();
}

/**
 * In an exercise chat, the fixed (non-AI) reply to a learner's message.
 * Category sets and tense contrast / form drills: the first message answers the
 * whole set (src/lib/exercise-set.ts), graded from the text and the mistakes the
 * correction found in it, so retrying it regrades it the same way; later
 * messages are normal corrections. "Use it" tasks go one at a time: the n-th
 * answer answers the n-th task. Null outside exercise chats and when there's
 * nothing left to answer.
 */
export function exerciseReplyFor(
  userId: string,
  practice: Practice | null,
  message: Message,
  mistakes: readonly FoundMistake[],
): ExerciseTurn | null {
  if (!practice || practice.kind === "conversation" || practice.kind === "topic") return null;
  const earlier = earlierAnswers(userId, message);

  if (practice.kind === "use") {
    const result = exerciseReply({ practice, index: earlier.length, learnerText: message.content, previousChecks: [] });
    // Open tasks are never saved as missed.
    return result && { text: result.text, outcomes: [] };
  }
  if (earlier.length > 0) return null;

  // Only mistakes that count in the stats decide whether an answer is wrong.
  const { countTyposInStats } = getSettings(userId);
  // Just found by the correction, so none of them can be discarded yet.
  const counted = mistakes.filter((m) =>
    countsInStats({ ...m, inputMode: message.inputMode, discardedAt: null }, countTyposInStats),
  );
  const results =
    practice.kind === "category"
      ? gradeCategorySet(practice, message.content, counted)
      : gradeTenseSet(practice, message.content, counted);

  const topic = practice.kind === "category" ? categoryTopic(practice) : practiceTopic(practice);
  const outcomes = results.map((result, index) => {
    const item = practice.items[index];
    const missed: MissedItem | null =
      result.mark === "wrong"
        ? {
            topic,
            category: practice.kind === "category" ? practice.category : null,
            subtype: practice.kind === "category" ? practice.subtype : null,
            tense: practice.kind === "category" ? null : (practice.items[index].tenses[0] ?? practice.tense),
            sentence: item.sentence,
            answer: item.answer,
            why: item.why,
            learnerAnswer: result.learnerAnswer ?? "",
          }
        : null;
    return { index, missed };
  });
  return { text: setSummary(results), outcomes };
}

/**
 * Whether the chat is waiting for the answer to its set, and how many items it
 * has: for the composer's numbered draft.
 */
export function pendingSetSize(userId: string, sessionId: string): number | null {
  const practice = getPractice(userId, sessionId);
  if (!isSetPractice(practice)) return null;
  const answered = db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.sessionId, sessionId), eq(schema.messages.role, "user")))
    .get();
  return answered ? null : practice.items.length;
}
