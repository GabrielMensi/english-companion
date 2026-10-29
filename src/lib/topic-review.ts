import "server-only";

import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { generateFeedback, suggestPhrases } from "@/lib/ai/topic-review";
import { getMessages, getSession } from "@/lib/chat";
import { withChatPriority } from "@/lib/classification";
import { getPractice } from "@/lib/practice";
import { getSettings } from "@/lib/settings";
import { countsInStats } from "@/lib/taxonomy";
import {
  isGrounded,
  MAX_REVIEW_TURNS,
  MIN_REVIEW_TURNS,
  normalizeQuote,
  type PhraseSource,
  type PhraseSuggestion,
  type ReviewTurn,
  type TopicFeedback,
} from "@/lib/topic-review-core";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

/** The feedback of each topic chat lives in the user's key-value `user_settings` table, like the practice state. */
const feedbackKey = (sessionId: string) => `feedback:${sessionId}`;

export interface StoredFeedback {
  feedback: TopicFeedback;
  /** How many of the learner's messages it was written from. */
  messages: number;
  generatedAt: number;
  provider: string;
  modelId: string;
}

export function getStoredFeedback(userId: string, sessionId: string): StoredFeedback | null {
  return (getUserSetting(userId, feedbackKey(sessionId)) as StoredFeedback | undefined) ?? null;
}

/** The topic of the chat, or null when it isn't a topic chat (or isn't the user's). */
function topicOf(userId: string, sessionId: string): string | null {
  if (!getSession(userId, sessionId)) return null;
  const practice = getPractice(userId, sessionId);
  return practice?.kind === "topic" ? practice.topic : null;
}

/** Stripped to the parts of the chat the review needs. */
function reviewTurns(userId: string, sessionId: string): ReviewTurn[] {
  const { countTyposInStats } = getSettings(userId);
  const messages = getMessages(userId, sessionId);
  const turns: ReviewTurn[] = [];
  let question: string | null = null;
  for (const m of messages) {
    if (m.role === "assistant") {
      question = m.content;
      continue;
    }
    if (m.status !== "done") continue;
    turns.push({
      question,
      text: m.content,
      natural: m.naturalText && m.naturalText !== m.content ? m.naturalText : null,
      mistakes: m.corrections
        .filter((c) => countsInStats({ ...c, inputMode: m.inputMode }, countTyposInStats))
        .map((c) => ({ original: c.original, correction: c.correction, category: c.category })),
    });
  }
  return turns.slice(-MAX_REVIEW_TURNS);
}

/** Writes (and saves) the review of a topic chat from the learner's messages and stored corrections. */
export async function createFeedback(userId: string, sessionId: string): Promise<StoredFeedback> {
  const topic = topicOf(userId, sessionId);
  if (!topic) throw new Error("Feedback is only available in topic chats");
  const turns = reviewTurns(userId, sessionId);
  if (turns.length < MIN_REVIEW_TURNS)
    throw new Error("Answer a few more questions first: there is not enough to review");
  const { feedback, provider, modelId } = await withChatPriority(userId, () =>
    generateFeedback(topic, turns, getSettings(userId)),
  );
  const stored: StoredFeedback = { feedback, messages: turns.length, generatedAt: Date.now(), provider, modelId };
  setUserSetting(userId, feedbackKey(sessionId), stored);
  return stored;
}

/** Keys (normalized) of the English words and phrases already on the Vocabulary page. */
function savedPhrases(userId: string): Set<string> {
  const rows = db
    .select({ english: schema.vocabulary.english })
    .from(schema.vocabulary)
    .where(owned(schema.vocabulary, userId))
    .all();
  return new Set(rows.flatMap((r) => r.english.map(normalizeQuote)));
}

/** Suggests phrases from the chat for the Vocabulary page. Nothing is saved until the learner picks them. */
export async function createPhraseSuggestions(userId: string, sessionId: string): Promise<PhraseSuggestion[]> {
  const topic = topicOf(userId, sessionId);
  if (!topic) throw new Error("Phrases are only available in topic chats");
  const sources: PhraseSource[] = getMessages(userId, sessionId).flatMap((m) => {
    if (m.role === "assistant") return [{ messageId: m.id, text: m.content }];
    return m.naturalText && m.naturalText !== m.content ? [{ messageId: m.id, text: m.naturalText }] : [];
  });
  if (sources.length === 0) throw new Error("There is nothing to pick from yet");
  return withChatPriority(userId, () => suggestPhrases(topic, sources, savedPhrases(userId), getSettings(userId)));
}

/**
 * Saves the phrases the learner picked as vocabulary entries (Spanish meaning, English phrase), linked to
 * the message they come from so the page shows the chat. Each phrase must be in that message of this chat.
 * Returns how many were new.
 */
export function savePhrases(userId: string, sessionId: string, phrases: readonly PhraseSuggestion[]): number {
  const topic = topicOf(userId, sessionId);
  if (!topic) throw new Error("Phrases are only available in topic chats");
  const messages = new Map(getMessages(userId, sessionId).map((m) => [m.id, m]));
  const saved = savedPhrases(userId);
  let added = 0;
  for (const item of phrases) {
    const message = messages.get(item.messageId);
    const key = normalizeQuote(item.phrase);
    if (!message || saved.has(key) || !isGrounded(item.phrase, [message.content, message.naturalText ?? ""])) continue;
    db.insert(schema.vocabulary)
      .values({
        id: crypto.randomUUID(),
        userId,
        messageId: message.id,
        spanish: item.spanish.trim(),
        english: [item.phrase.trim()],
        note: `From the topic chat “${topic}”`,
      })
      .run();
    saved.add(key);
    added++;
  }
  return added;
}
