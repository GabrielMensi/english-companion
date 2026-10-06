import { relations } from "drizzle-orm";
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { FallbackAttempt } from "@/lib/ai/fallback";
import type { CardKind } from "@/lib/flashcards-core";
import type { Grade } from "@/lib/srs";
import type { FluencyMetrics } from "@/lib/fluency";
import type { TenseCounts } from "@/lib/tenses-core";
import type { ErrorCategory, PronunciationCategory, Severity, Tense } from "@/lib/taxonomy";

export type SessionMode = "correction" | "conversation";
export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "done" | "error";
/** How the learner wrote the message: typed, or dictated with speech-to-text. */
export type InputMode = "typed" | "spoken";
/** Fine classification of a correction, done later by the deferred classifier. */
export type ClassificationStatus = "pending" | "done" | "failed" | "skipped";
/**
 * Where a read-aloud sentence came from: the built-in sound sets, the learner's
 * corrections or vocabulary, or a "Hard to say" flashcard (a sentence read before).
 */
export type ReadAloudSource = "sounds" | "correction" | "vocabulary" | "review";

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
    inputMode: text("input_mode").$type<InputMode>().notNull().default("typed"),
    // The fields below only apply to spoken messages.
    /** What speech-to-text returned, before the learner edited it. */
    transcriptRaw: text("transcript_raw"),
    /** Whether the learner changed the transcript before sending it. */
    transcriptEdited: integer("transcript_edited", { mode: "boolean" }),
    transcriptionProvider: text("transcription_provider"),
    transcriptionModel: text("transcription_model"),
    audioDurationMs: integer("audio_duration_ms"),
    /** Pace, long pauses and fillers, from the transcription's word timestamps. */
    fluency: text("fluency", { mode: "json" }).$type<FluencyMetrics>(),
    /** Tenses in the corrected text, filled in by the dashboard; recomputed when the counter's version changes. */
    tenseCounts: text("tense_counts", { mode: "json" }).$type<{ version: number; counts: TenseCounts }>(),
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
    /** Fixed fine-grained type from `SUBTYPES[category]`; null until classified. */
    subtype: text("subtype"),
    /** For verb mistakes: the tense the sentence needed... */
    tense: text("tense").$type<Tense>(),
    /** ...and the tense the learner used instead (only when the tense choice was wrong). */
    tenseUsed: text("tense_used").$type<Tense>(),
    classification: text("classification").$type<ClassificationStatus>().notNull().default("pending"),
    /** Who assigned the subtype: "rule", "user" or "<provider>:<model>". */
    classifiedBy: text("classified_by"),
    classificationAttempts: integer("classification_attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("corrections_message_idx").on(t.messageId),
    index("corrections_classification_idx").on(t.classification),
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

/**
 * Spaced repetition state of each flashcard (see src/lib/srs.ts). Cards aren't
 * stored: they're built from vocabulary lookups and corrections, and matched
 * here by `card_key` (a vocabulary word key, or "original → correction").
 */
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<CardKind>().notNull(),
    cardKey: text("card_key").notNull(),
    ease: real("ease").notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    reviewCount: integer("review_count").notNull().default(0),
    lastGrade: text("last_grade").$type<Grade>(),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
    /**
     * When the learner suspended the card (null = active). Suspended cards are
     * left out of every deck until unsuspended. Suspending a card that was never
     * reviewed creates a row with `review_count` 0, which still counts as new.
     */
    suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reviews_card_idx").on(t.kind, t.cardKey), index("reviews_due_idx").on(t.dueAt)],
);

/**
 * Exercise items the learner got wrong in a practice chat (tense or category
 * exercises), kept for spaced review as the "Missed exercises" flashcard deck.
 * One row per item of a chat: answering it again (a retry) updates or removes it.
 * Rows outlive the chat, so deleting a practice chat keeps its cards.
 */
export const missedExercises = sqliteTable(
  "missed_exercises",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
    /** Position of the item in the chat's set (0-based). */
    itemIndex: integer("item_index").notNull(),
    /** What was practiced: "Present perfect vs past simple", "Prepositions"... */
    topic: text("topic").notNull(),
    category: text("category").$type<ErrorCategory>(),
    subtype: text("subtype"),
    tense: text("tense").$type<Tense>(),
    /** The exercise as shown ("I ___ (live) here since 2020."). */
    sentence: text("sentence").notNull(),
    answer: text("answer").notNull(),
    why: text("why").notNull(),
    learnerAnswer: text("learner_answer").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("missed_exercises_item_idx").on(t.sessionId, t.itemIndex)],
);

/**
 * One row per flashcard answer, for the review stats (retention, reviews per
 * day, streak). `reviews` only keeps each card's latest state, so this history
 * starts when the table was added. Rows stay when a card is deleted.
 */
export const reviewLog = sqliteTable(
  "review_log",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<CardKind>().notNull(),
    cardKey: text("card_key").notNull(),
    grade: text("grade").$type<Grade>().notNull(),
    /** Whether it was the card's first review. */
    wasNew: integer("was_new", { mode: "boolean" }).notNull(),
    /** Days until the next review, after this answer. */
    intervalDays: integer("interval_days").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("review_log_reviewed_idx").on(t.reviewedAt)],
);

/**
 * One read-aloud attempt: the learner read `text` and speech-to-text heard
 * `transcript`. Scored without AI (src/lib/pronunciation-core.ts). The audio is
 * never kept.
 */
export const readAloudAttempts = sqliteTable(
  "read_aloud_attempts",
  {
    id: text("id").primaryKey(),
    source: text("source").$type<ReadAloudSource>().notNull(),
    /** The message or vocabulary row the sentence came from (not a foreign key: attempts outlive them). */
    sourceId: text("source_id"),
    /** For built-in sentences: the sound they practice. */
    focus: text("focus").$type<PronunciationCategory>(),
    text: text("text").notNull(),
    transcript: text("transcript").notNull(),
    correctWords: integer("correct_words").notNull(),
    totalWords: integer("total_words").notNull(),
    audioDurationMs: integer("audio_duration_ms"),
    transcriptionProvider: text("transcription_provider"),
    transcriptionModel: text("transcription_model"),
    createdAt: createdAt(),
  },
  (t) => [index("read_aloud_attempts_created_idx").on(t.createdAt)],
);

/** A word heard differently in a read-aloud attempt, with its pronunciation category. */
export const pronunciationIssues = sqliteTable(
  "pronunciation_issues",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => readAloudAttempts.id, { onDelete: "cascade" }),
    /** The word(s) as written in the sentence... */
    expected: text("expected").notNull(),
    /** ...and what speech-to-text heard. */
    heard: text("heard").notNull(),
    category: text("category").$type<PronunciationCategory>().notNull(),
    /** The sound that changed, in IPA ("/ɪ/ → /iː/"). */
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("pronunciation_issues_attempt_idx").on(t.attemptId), index("pronunciation_issues_created_idx").on(t.createdAt)],
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
export type Review = typeof reviews.$inferSelect;
export type MissedExercise = typeof missedExercises.$inferSelect;
export type ReviewLogEntry = typeof reviewLog.$inferSelect;
export type ReadAloudAttempt = typeof readAloudAttempts.$inferSelect;
export type PronunciationIssueRow = typeof pronunciationIssues.$inferSelect;
