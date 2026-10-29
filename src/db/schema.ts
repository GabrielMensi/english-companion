import { relations } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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

/**
 * Whose row it is. Nullable on purpose: SQLite can't add a NOT NULL column with a foreign key to a table
 * that has rows, and rebuilding the table would cascade-delete its children. Rows from before accounts
 * existed stay NULL until `pnpm auth:claim-data <email>` gives them to a user; no query returns them
 * before that (every query filters by the signed-in user, see src/db/owned.ts).
 */
const owner = () => text("user_id").references((): AnySQLiteColumn => authUser.id, { onDelete: "cascade" });

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull().default("Nuevo chat"),
    mode: text("mode").$type<SessionMode>().notNull().default("correction"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("sessions_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: owner(),
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
  (t) => [
    index("messages_session_idx").on(t.sessionId, t.createdAt),
    index("messages_user_idx").on(t.userId, t.createdAt),
  ],
);

export const corrections = sqliteTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    original: text("original").notNull(),
    correction: text("correction").notNull(),
    category: text("category").$type<ErrorCategory>().notNull(),
    subcategory: text("subcategory").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    /** The severity before the learner marked it as a typo by hand, restored if they change the type back. */
    severityBeforeTypo: text("severity_before_typo").$type<Severity>(),
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
    /**
     * When the learner discarded it as a wrong correction. It's kept (and can be
     * restored), shown in the chat, but never counted in the stats (`countsInStats`).
     */
    discardedAt: integer("discarded_at", { mode: "timestamp_ms" }),
    /** Why it was discarded, if the learner said. */
    discardReason: text("discard_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("corrections_message_idx").on(t.messageId),
    index("corrections_classification_idx").on(t.classification),
    index("corrections_created_idx").on(t.createdAt),
    index("corrections_user_idx").on(t.userId, t.createdAt),
    index("corrections_user_classification_idx").on(t.userId, t.classification),
  ],
);

/** Spanish words/phrases the learner didn't know how to say in English. */
export const vocabulary = sqliteTable(
  "vocabulary",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    spanish: text("spanish").notNull(),
    english: text("english", { mode: "json" }).$type<string[]>().notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("vocabulary_created_idx").on(t.createdAt), index("vocabulary_user_idx").on(t.userId, t.createdAt)],
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
    userId: owner(),
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
  (t) => [
    // One state per card and learner. Rows from before accounts (user_id NULL) don't collide with each other:
    // SQLite treats NULLs as distinct, and they were already unique by (kind, card_key).
    uniqueIndex("reviews_user_card_idx").on(t.userId, t.kind, t.cardKey),
    index("reviews_due_idx").on(t.dueAt),
  ],
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
    userId: owner(),
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
  (t) => [
    uniqueIndex("missed_exercises_item_idx").on(t.sessionId, t.itemIndex),
    index("missed_exercises_user_idx").on(t.userId, t.createdAt),
  ],
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
    userId: owner(),
    kind: text("kind").$type<CardKind>().notNull(),
    cardKey: text("card_key").notNull(),
    grade: text("grade").$type<Grade>().notNull(),
    /** Whether it was the card's first review. */
    wasNew: integer("was_new", { mode: "boolean" }).notNull(),
    /** Days until the next review, after this answer. */
    intervalDays: integer("interval_days").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("review_log_reviewed_idx").on(t.reviewedAt), index("review_log_user_idx").on(t.userId, t.reviewedAt)],
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
    userId: owner(),
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
  (t) => [
    index("read_aloud_attempts_created_idx").on(t.createdAt),
    index("read_aloud_attempts_user_idx").on(t.userId, t.createdAt),
  ],
);

/** A word heard differently in a read-aloud attempt, with its pronunciation category. */
export const pronunciationIssues = sqliteTable(
  "pronunciation_issues",
  {
    id: text("id").primaryKey(),
    userId: owner(),
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
  (t) => [
    index("pronunciation_issues_attempt_idx").on(t.attemptId),
    index("pronunciation_issues_created_idx").on(t.createdAt),
    index("pronunciation_issues_user_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * The old key-value table, from when the app had one user. Settings, practice state and AI outputs moved to
 * `userSettings`; this one only still holds `api-keys`, global until the per-user keys (#126). It is the only
 * table of data without `user_id` (see schema.test.ts).
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Per-user key-value: `app` (settings), `practice:<chat id>`, `insights-plan`, `insights-level-explanation`. */
export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => authUser.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// Better Auth's tables (src/lib/auth/auth.ts maps them by model name). `session` here is the login
// session; `sessions` above are the chats. Property names are the ones Better Auth uses.
const authDate = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull();

export const authUser = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: authDate("created_at").$defaultFn(() => new Date()),
  updatedAt: authDate("updated_at").$defaultFn(() => new Date()),
});

export const authSession = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: authDate("expires_at"),
    token: text("token").notNull().unique(),
    createdAt: authDate("created_at").$defaultFn(() => new Date()),
    updatedAt: authDate("updated_at").$defaultFn(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const authAccount = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    /** Scrypt hash of the password (provider "credential"). */
    password: text("password"),
    createdAt: authDate("created_at").$defaultFn(() => new Date()),
    updatedAt: authDate("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const authVerification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authDate("expires_at"),
    createdAt: authDate("created_at").$defaultFn(() => new Date()),
    updatedAt: authDate("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's rate limiter (`rateLimit.storage: "database"`): one row per client and route. */
export const authRateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
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
export type AuthUser = typeof authUser.$inferSelect;
