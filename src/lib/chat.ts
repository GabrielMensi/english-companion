import "server-only";

import { asc, desc, eq, lt, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import type { Correction, Message, SessionMode, VocabularyEntry } from "@/db/schema";
import type { HistoryTurn } from "@/lib/ai/analysis";
import { analyzeMessage, type OnPreview } from "@/lib/ai/analyze";
import { errorToMessage } from "@/lib/ai/fallback";
import { improvePrompt } from "@/lib/ai/improve-prompt";
import { withChatPriority } from "@/lib/classification";
import { toChatCorrection } from "@/lib/correction-review";
import { recordExerciseResult } from "@/lib/missed-exercises";
import { deletePractice, exerciseReplyFor, getPractice, practiceReplyRule } from "@/lib/practice";
import { carryOverReviews } from "@/lib/review-carry-over";
import { logRouteError } from "@/lib/server-log";
import { getSettings } from "@/lib/settings";
import { countWords, makeTitle } from "@/lib/text";
import type { ChatMessage, VoiceInput } from "@/lib/types";
import { deleteUserSetting } from "@/lib/user-settings";

const HISTORY_TURNS = 10;

export function listSessions(userId: string) {
  return (
    db
      .select()
      .from(schema.sessions)
      // The hidden chats of what the teacher corrected in class aren't conversations.
      .where(owned(schema.sessions, userId, ne(schema.sessions.mode, "class")))
      .orderBy(desc(schema.sessions.updatedAt))
      .all()
  );
}

/** The chat, or undefined when it doesn't exist or belongs to someone else. */
export function getSession(userId: string, id: string) {
  return db
    .select()
    .from(schema.sessions)
    .where(owned(schema.sessions, userId, eq(schema.sessions.id, id), ne(schema.sessions.mode, "class")))
    .get();
}

export function createSession(userId: string, mode: SessionMode) {
  return db
    .insert(schema.sessions)
    .values({ id: crypto.randomUUID(), userId, title: "New chat", mode })
    .returning()
    .get();
}

export function updateSession(userId: string, id: string, data: { title?: string; mode?: SessionMode }) {
  return db
    .update(schema.sessions)
    .set({ ...data, updatedAt: new Date() })
    .where(owned(schema.sessions, userId, eq(schema.sessions.id, id)))
    .returning()
    .get();
}

export function deleteSession(userId: string, id: string) {
  const deleted = db
    .delete(schema.sessions)
    // A class's hidden chat goes with its class (src/lib/class.ts), never on its own.
    .where(owned(schema.sessions, userId, eq(schema.sessions.id, id), ne(schema.sessions.mode, "class")))
    .run().changes;
  if (deleted > 0) {
    deletePractice(userId, id);
    deleteUserSetting(userId, `feedback:${id}`);
  }
}

export function getMessages(userId: string, sessionId: string): ChatMessage[] {
  return db.query.messages
    .findMany({
      where: owned(schema.messages, userId, eq(schema.messages.sessionId, sessionId)),
      orderBy: [asc(schema.messages.createdAt)],
      with: { corrections: true, vocabulary: true },
    })
    .sync()
    .map(toChatMessage);
}

export function getMessage(userId: string, id: string): ChatMessage | undefined {
  const row = db.query.messages
    .findFirst({
      where: owned(schema.messages, userId, eq(schema.messages.id, id)),
      with: { corrections: true, vocabulary: true },
    })
    .sync();
  // The messages of a class's hidden chat can't be retried, prompted or opened.
  return row && getSession(userId, row.sessionId) ? toChatMessage(row) : undefined;
}

function toChatMessage({
  userId: _owner,
  ...row
}: Message & { corrections: Correction[]; vocabulary: VocabularyEntry[] }): ChatMessage {
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    corrections: row.corrections.map(toChatCorrection),
    vocabulary: row.vocabulary.map(({ userId: _vocabularyOwner, ...v }) => ({
      ...v,
      createdAt: v.createdAt.getTime(),
    })),
  };
}

/** Stores the learner's message; the analysis runs in {@link analyzeStoredMessage}. */
export function addUserMessage(userId: string, sessionId: string, text: string, voice?: VoiceInput) {
  const session = getSession(userId, sessionId);
  if (!session) return undefined;

  const isFirst = !db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.sessionId, sessionId)))
    .get();

  const message = db
    .insert(schema.messages)
    .values({
      id: crypto.randomUUID(),
      userId,
      sessionId,
      role: "user",
      content: text,
      status: "pending",
      wordCount: countWords(text),
      ...(voice && { inputMode: "spoken" as const, ...voice }),
    })
    .returning()
    .get();

  updateSession(userId, sessionId, isFirst ? { title: makeTitle(text) } : {});
  return message;
}

/**
 * Runs the AI analysis for a stored user message and persists corrections,
 * vocabulary and (in conversation mode) the assistant reply. Also used to retry.
 * `onPreview` streams the analysis while it's generated; what gets saved is the same.
 */
export async function analyzeStoredMessage(
  userId: string,
  messageId: string,
  onPreview?: OnPreview,
): Promise<ChatMessage[]> {
  const message = getUserMessageRow(userId, messageId);
  if (!message || message.role !== "user") throw new Error("Message not found");
  const session = getSession(userId, message.sessionId);
  if (!session) throw new Error("Chat not found");

  const settings = getSettings(userId);
  // Practice chats (see src/lib/practice.ts): steered follow-up questions, or exercise feedback.
  const practice = getPractice(userId, session.id);

  try {
    const started = Date.now();
    const { analysis, provider, modelId, fallbackAttempts } = await withChatPriority(userId, () =>
      analyzeMessage(
        userId,
        {
          text: message.content,
          mode: session.mode,
          history: getHistory(userId, message),
          inputMode: message.inputMode,
          practiceRule: practiceReplyRule(practice),
        },
        settings,
        onPreview,
      ),
    );
    const durationMs = Date.now() - started;
    const exercise = exerciseReplyFor(userId, practice, message, analysis.errors);
    const reply = exercise
      ? { content: exercise.text, provider: null, model: null, durationMs: null }
      : analysis.reply && { content: analysis.reply, provider, model: modelId, durationMs };

    db.transaction((tx) => {
      // Retrying replaces any previous result for this message, keeping the learner's own review of it.
      const previous = tx
        .select()
        .from(schema.corrections)
        .where(owned(schema.corrections, userId, eq(schema.corrections.messageId, message.id)))
        .all();
      const carried = carryOverReviews(previous, analysis.errors);
      tx.delete(schema.corrections)
        .where(owned(schema.corrections, userId, eq(schema.corrections.messageId, message.id)))
        .run();
      tx.delete(schema.vocabulary)
        .where(owned(schema.vocabulary, userId, eq(schema.vocabulary.messageId, message.id)))
        .run();
      tx.delete(schema.messages)
        .where(owned(schema.messages, userId, eq(schema.messages.replyToId, message.id)))
        .run();

      tx.update(schema.messages)
        .set({
          status: "done",
          errorMessage: null,
          correctedText: analysis.correctedText,
          naturalText: analysis.naturalText,
          provider,
          model: modelId,
          fallbackAttempts: fallbackAttempts.length > 0 ? fallbackAttempts : null,
          durationMs,
        })
        .where(owned(schema.messages, userId, eq(schema.messages.id, message.id)))
        .run();

      const now = message.createdAt;
      if (analysis.errors.length > 0) {
        tx.insert(schema.corrections)
          .values(
            analysis.errors.map((e, i) => ({
              id: crypto.randomUUID(),
              userId,
              messageId: message.id,
              createdAt: now,
              ...e,
              ...carried[i],
            })),
          )
          .run();
      }
      if (analysis.spanishPhrases.length > 0) {
        tx.insert(schema.vocabulary)
          .values(
            analysis.spanishPhrases.map((p) => ({
              id: crypto.randomUUID(),
              userId,
              messageId: message.id,
              createdAt: now,
              ...p,
            })),
          )
          .run();
      }
      if (reply) {
        tx.insert(schema.messages)
          .values({
            id: crypto.randomUUID(),
            userId,
            sessionId: message.sessionId,
            role: "assistant",
            replyToId: message.id,
            ...reply,
            // Sort the reply right after the message it answers, even on retries.
            createdAt: new Date(message.createdAt.getTime() + 1),
          })
          .run();
      }
    });
    // Missed exercise items go to the "Missed exercises" flashcard deck.
    if (exercise) recordExerciseResult(userId, message.sessionId, exercise);
  } catch (error) {
    logRouteError("chat turn", error);
    db.update(schema.messages)
      .set({ status: "error", errorMessage: errorToMessage(error) })
      .where(owned(schema.messages, userId, eq(schema.messages.id, message.id)))
      .run();
  }

  updateSession(userId, message.sessionId, {});
  return getTurn(userId, message.id);
}

/** The analyzed user message plus its reply, if any. */
function getTurn(userId: string, messageId: string): ChatMessage[] {
  const user = getMessage(userId, messageId)!;
  const reply = db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.replyToId, messageId)))
    .get();
  return reply ? [user, getMessage(userId, reply.id)!] : [user];
}

function getHistory(userId: string, message: Message): HistoryTurn[] {
  const previous = db
    .select()
    .from(schema.messages)
    .where(
      owned(
        schema.messages,
        userId,
        eq(schema.messages.sessionId, message.sessionId),
        lt(schema.messages.createdAt, message.createdAt),
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(HISTORY_TURNS * 2)
    .all()
    .reverse();

  const turns: HistoryTurn[] = [];
  for (const m of previous) {
    if (m.role === "user") {
      turns.push({ learner: m.correctedText ?? m.content, assistant: null });
    } else if (turns.length > 0) {
      turns[turns.length - 1].assistant = m.content;
    } else {
      // A chat that starts with a question from the tutor (tense practice).
      turns.push({ learner: null, assistant: m.content });
    }
  }
  return turns;
}

/** A message row of this user (the stored row, not the chat shape). */
function getUserMessageRow(userId: string, id: string) {
  return db
    .select()
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.id, id)))
    .get();
}

export async function improveMessagePrompt(userId: string, messageId: string) {
  const message = getUserMessageRow(userId, messageId);
  if (!message || message.role !== "user") throw new Error("Message not found");

  const started = Date.now();
  const { prompt, provider, modelId } = await withChatPriority(userId, () =>
    improvePrompt(userId, message.correctedText ?? message.content, getSettings(userId)),
  );
  const update = {
    improvedPrompt: prompt,
    improvedPromptProvider: provider,
    improvedPromptModel: modelId,
    improvedPromptDurationMs: Date.now() - started,
  };
  db.update(schema.messages)
    .set(update)
    .where(owned(schema.messages, userId, eq(schema.messages.id, messageId)))
    .run();
  return update;
}
