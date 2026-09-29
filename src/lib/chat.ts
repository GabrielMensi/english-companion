import "server-only";

import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Correction, Message, SessionMode, VocabularyEntry } from "@/db/schema";
import { analyzeMessage } from "@/lib/ai/analyze";
import { errorToMessage } from "@/lib/ai/fallback";
import type { HistoryTurn } from "@/lib/ai/analysis";
import { improvePrompt } from "@/lib/ai/improve-prompt";
import { withChatPriority } from "@/lib/classification";
import { getSettings } from "@/lib/settings";
import { countWords, makeTitle } from "@/lib/text";
import type { ChatMessage } from "@/lib/types";

const HISTORY_TURNS = 10;

export function listSessions() {
  return db.select().from(schema.sessions).orderBy(desc(schema.sessions.updatedAt)).all();
}

export function getSession(id: string) {
  return db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
}

export function createSession(mode: SessionMode) {
  return db
    .insert(schema.sessions)
    .values({ id: crypto.randomUUID(), title: "New chat", mode })
    .returning()
    .get();
}

export function updateSession(id: string, data: { title?: string; mode?: SessionMode }) {
  return db
    .update(schema.sessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.sessions.id, id))
    .returning()
    .get();
}

export function deleteSession(id: string) {
  db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
}

export function getMessages(sessionId: string): ChatMessage[] {
  return db.query.messages
    .findMany({
      where: eq(schema.messages.sessionId, sessionId),
      orderBy: [asc(schema.messages.createdAt)],
      with: { corrections: true, vocabulary: true },
    })
    .sync()
    .map(toChatMessage);
}

export function getMessage(id: string): ChatMessage | undefined {
  const row = db.query.messages
    .findFirst({
      where: eq(schema.messages.id, id),
      with: { corrections: true, vocabulary: true },
    })
    .sync();
  return row ? toChatMessage(row) : undefined;
}

function toChatMessage(row: Message & { corrections: Correction[]; vocabulary: VocabularyEntry[] }): ChatMessage {
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    corrections: row.corrections.map((c) => ({ ...c, createdAt: c.createdAt.getTime() })),
    vocabulary: row.vocabulary.map((v) => ({ ...v, createdAt: v.createdAt.getTime() })),
  };
}

/** Stores the learner's message; the analysis runs in {@link analyzeStoredMessage}. */
export function addUserMessage(sessionId: string, text: string) {
  const session = getSession(sessionId);
  if (!session) return undefined;

  const isFirst = !db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, sessionId))
    .get();

  const message = db
    .insert(schema.messages)
    .values({
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: text,
      status: "pending",
      wordCount: countWords(text),
    })
    .returning()
    .get();

  updateSession(sessionId, isFirst ? { title: makeTitle(text) } : {});
  return message;
}

/**
 * Runs the AI analysis for a stored user message and persists corrections,
 * vocabulary and (in conversation mode) the assistant reply. Also used to retry.
 */
export async function analyzeStoredMessage(messageId: string): Promise<ChatMessage[]> {
  const message = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  if (!message || message.role !== "user") throw new Error("Message not found");
  const session = getSession(message.sessionId);
  if (!session) throw new Error("Chat not found");

  const settings = getSettings();

  try {
    const started = Date.now();
    const { analysis, provider, modelId, fallbackAttempts } = await withChatPriority(() =>
      analyzeMessage({ text: message.content, mode: session.mode, history: getHistory(message) }, settings),
    );
    const durationMs = Date.now() - started;

    db.transaction((tx) => {
      // Retrying replaces any previous result for this message.
      tx.delete(schema.corrections).where(eq(schema.corrections.messageId, message.id)).run();
      tx.delete(schema.vocabulary).where(eq(schema.vocabulary.messageId, message.id)).run();
      tx.delete(schema.messages).where(eq(schema.messages.replyToId, message.id)).run();

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
        .where(eq(schema.messages.id, message.id))
        .run();

      const now = message.createdAt;
      if (analysis.errors.length > 0) {
        tx.insert(schema.corrections)
          .values(
            analysis.errors.map((e) => ({ id: crypto.randomUUID(), messageId: message.id, createdAt: now, ...e })),
          )
          .run();
      }
      if (analysis.spanishPhrases.length > 0) {
        tx.insert(schema.vocabulary)
          .values(
            analysis.spanishPhrases.map((p) => ({
              id: crypto.randomUUID(),
              messageId: message.id,
              createdAt: now,
              ...p,
            })),
          )
          .run();
      }
      if (analysis.reply) {
        tx.insert(schema.messages)
          .values({
            id: crypto.randomUUID(),
            sessionId: message.sessionId,
            role: "assistant",
            replyToId: message.id,
            content: analysis.reply,
            provider,
            model: modelId,
            durationMs,
            // Sort the reply right after the message it answers, even on retries.
            createdAt: new Date(message.createdAt.getTime() + 1),
          })
          .run();
      }
    });
  } catch (error) {
    db.update(schema.messages)
      .set({ status: "error", errorMessage: errorToMessage(error) })
      .where(eq(schema.messages.id, message.id))
      .run();
  }

  updateSession(message.sessionId, {});
  return getTurn(message.id);
}

/** The analyzed user message plus its reply, if any. */
function getTurn(messageId: string): ChatMessage[] {
  const user = getMessage(messageId)!;
  const reply = db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.replyToId, messageId))
    .get();
  return reply ? [user, getMessage(reply.id)!] : [user];
}

function getHistory(message: Message): HistoryTurn[] {
  const previous = db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.sessionId, message.sessionId), lt(schema.messages.createdAt, message.createdAt)))
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
    }
  }
  return turns;
}

export async function improveMessagePrompt(messageId: string) {
  const message = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  if (!message || message.role !== "user") throw new Error("Message not found");

  const started = Date.now();
  const { prompt, provider, modelId } = await withChatPriority(() =>
    improvePrompt(message.correctedText ?? message.content, getSettings()),
  );
  const update = {
    improvedPrompt: prompt,
    improvedPromptProvider: provider,
    improvedPromptModel: modelId,
    improvedPromptDurationMs: Date.now() - started,
  };
  db.update(schema.messages).set(update).where(eq(schema.messages.id, messageId)).run();
  return update;
}

