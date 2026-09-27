import { relations } from "drizzle-orm";
import { type AnySQLiteColumn, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { FallbackAttempt } from "@/lib/ai/fallback";
import type { ErrorCategory, Severity } from "@/lib/taxonomy";

export type SessionMode = "correction" | "conversation";
export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "done" | "error";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Nuevo chat"),
  mode: text("mode").$type<SessionMode>().notNull().default("correction"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").$type<MessageRole>().notNull(),
    /** For assistant replies: the user message they answer. */
    replyToId: text("reply_to_id").references((): AnySQLiteColumn => messages.id, { onDelete: "cascade" }),
    /** What the learner wrote, or the assistant's conversational reply. */
    content: text("content").notNull(),
    // The fields below only apply to user messages.
    status: text("status").$type<MessageStatus>().notNull().default("done"),
    errorMessage: text("error_message"),
    correctedText: text("corrected_text"),
    naturalText: text("natural_text"),
    improvedPrompt: text("improved_prompt"),
    improvedPromptProvider: text("improved_prompt_provider"),
    improvedPromptModel: text("improved_prompt_model"),
    /** How long generating the improved prompt took, in milliseconds. */
    improvedPromptDurationMs: integer("improved_prompt_duration_ms"),
    wordCount: integer("word_count").notNull().default(0),
    /** Provider and model that produced the analysis (or the reply). */
    provider: text("provider"),
    model: text("model"),
    /** Models tried before `model` that failed, when the fallback kicked in. */
    fallbackAttempts: text("fallback_attempts", { mode: "json" }).$type<FallbackAttempt[]>(),
    /** How long the analysis (or the reply, generated with it) took, including fallbacks, in milliseconds. */
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_session_idx").on(t.sessionId, t.createdAt)],
);

export const corrections = sqliteTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    original: text("original").notNull(),
    correction: text("correction").notNull(),
    category: text("category").$type<ErrorCategory>().notNull(),
    subcategory: text("subcategory").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    explanation: text("explanation").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("corrections_message_idx").on(t.messageId),
    index("corrections_created_idx").on(t.createdAt),
  ],
);

/** Spanish words/phrases the learner didn't know how to say in English. */
export const vocabulary = sqliteTable(
  "vocabulary",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    spanish: text("spanish").notNull(),
    english: text("english", { mode: "json" }).$type<string[]>().notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("vocabulary_created_idx").on(t.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] }),
  corrections: many(corrections),
  vocabulary: many(vocabulary),
}));

export const correctionsRelations = relations(corrections, ({ one }) => ({
  message: one(messages, { fields: [corrections.messageId], references: [messages.id] }),
}));

export const vocabularyRelations = relations(vocabulary, ({ one }) => ({
  message: one(messages, { fields: [vocabulary.messageId], references: [messages.id] }),
}));

export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Correction = typeof corrections.$inferSelect;
export type VocabularyEntry = typeof vocabulary.$inferSelect;
