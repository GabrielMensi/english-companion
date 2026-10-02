import "server-only";

import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Message } from "@/db/schema";
import { TENSES } from "@/lib/taxonomy";
import {
  type AnswerCheck,
  checkAnswer,
  conversationPracticeRule,
  EXERCISE_KINDS,
  type ExercisePractice,
  exerciseReply,
  focusTenses,
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

/**
 * In an exercise chat, the reply to a learner's answer: feedback on the tense
 * and the next item. The n-th analyzed answer in the chat answers the n-th item,
 * so retrying a message gives the same reply. Null outside exercise chats and
 * after the last item.
 */
export function exerciseReplyFor(practice: Practice | null, message: Message): string | null {
  if (!practice || practice.kind === "conversation") return null;
  const exercise: ExercisePractice = practice;

  const earlier = db
    .select({ content: schema.messages.content })
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

  const focus = focusTenses(exercise);
  const previousChecks: AnswerCheck[] = earlier
    .slice(0, exercise.items.length)
    .map((m, i) => checkAnswer(m.content, exercise.items[i], focus));

  return (
    exerciseReply({ practice: exercise, index: earlier.length, learnerText: message.content, previousChecks })?.text ??
    null
  );
}
