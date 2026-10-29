import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import type { ReadAloudSource } from "@/db/schema";
import { cmuLookup } from "@/lib/cmu-lookup";
import type { PronunciationCard } from "@/lib/flashcards-core";
import { type ReadAloudResult, scoreReading } from "@/lib/pronunciation-core";
import {
  type AccuracyPoint,
  accuracyTimeline,
  pronunciationCards,
  type PronunciationProgress,
  pronunciationProgress,
  type PronunciationSummary,
  type ReadAloudItem,
  readableSentences,
  soundItems,
  soundOrder,
  summarizePronunciation,
} from "@/lib/read-aloud-core";
import type { PronunciationCategory } from "@/lib/taxonomy";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The pronunciation panel looks at this many days. */
export const SUMMARY_DAYS = 30;
/** Sentences of your own read this recently aren't offered again. */
const RECENTLY_READ_DAYS = 14;
const MAX_ITEMS = 30;

export function getPronunciationSummary(userId: string, days = SUMMARY_DAYS): PronunciationSummary {
  return summarizeBetween(userId, new Date(Date.now() - days * DAY_MS), null);
}

/**
 * The dashboard's pronunciation panel: the last `days` days (all time with null)
 * against the period of the same length before.
 */
export function getPronunciationProgress(userId: string, days: number | null): PronunciationProgress {
  if (days === null) return pronunciationProgress(summarizeBetween(userId, null, null), null);
  const from = new Date(Date.now() - days * DAY_MS);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);
  return pronunciationProgress(summarizeBetween(userId, from, null), summarizeBetween(userId, previousFrom, from));
}

/** Read-aloud accuracy per day (or week) over the last `days` days (all time with null), for the dashboard chart. */
export function getAccuracyTimeline(userId: string, days: number | null): AccuracyPoint[] {
  const now = Date.now();
  const from = days === null ? null : now - days * DAY_MS;
  const attempts = db
    .select({
      createdAt: schema.readAloudAttempts.createdAt,
      correctWords: schema.readAloudAttempts.correctWords,
      totalWords: schema.readAloudAttempts.totalWords,
    })
    .from(schema.readAloudAttempts)
    .where(
      owned(
        schema.readAloudAttempts,
        userId,
        from === null ? undefined : gte(schema.readAloudAttempts.createdAt, new Date(from)),
      ),
    )
    .all();
  return accuracyTimeline(
    attempts.map((a) => ({ ...a, createdAt: a.createdAt.getTime() })),
    from,
    now,
  );
}

/** Readings made in [from, to); null leaves that end open. */
function summarizeBetween(userId: string, from: Date | null, to: Date | null): PronunciationSummary {
  const window = (column: AnySQLiteColumn) =>
    and(from ? gte(column, from) : undefined, to ? lt(column, to) : undefined);
  const attempts = db
    .select({ correctWords: schema.readAloudAttempts.correctWords, totalWords: schema.readAloudAttempts.totalWords })
    .from(schema.readAloudAttempts)
    .where(owned(schema.readAloudAttempts, userId, window(schema.readAloudAttempts.createdAt)))
    .all();
  const issues = db
    .select({
      category: schema.pronunciationIssues.category,
      expected: schema.pronunciationIssues.expected,
      heard: schema.pronunciationIssues.heard,
    })
    .from(schema.pronunciationIssues)
    .where(owned(schema.pronunciationIssues, userId, window(schema.pronunciationIssues.createdAt)))
    .all();
  return summarizePronunciation(attempts, issues);
}

/** Whether there's any reading at all, to decide if the dashboard shows the panel. */
export function hasReadings(userId: string): boolean {
  return (
    db
      .select({ id: schema.readAloudAttempts.id })
      .from(schema.readAloudAttempts)
      .where(owned(schema.readAloudAttempts, userId))
      .limit(1)
      .all().length > 0
  );
}

function recentlyRead(userId: string): Set<string> {
  const since = new Date(Date.now() - RECENTLY_READ_DAYS * DAY_MS);
  return new Set(
    db
      .select({ text: schema.readAloudAttempts.text })
      .from(schema.readAloudAttempts)
      .where(owned(schema.readAloudAttempts, userId, gte(schema.readAloudAttempts.createdAt, since)))
      .all()
      .map((r) => r.text),
  );
}

/** Sentences from your corrected messages, newest first. */
function correctionItems(userId: string, skip: Set<string>): ReadAloudItem[] {
  const rows = db
    .select({ id: schema.messages.id, corrected: schema.messages.correctedText, natural: schema.messages.naturalText })
    .from(schema.messages)
    .where(
      owned(
        schema.messages,
        userId,
        eq(schema.messages.role, "user"),
        eq(schema.messages.status, "done"),
        isNotNull(schema.messages.correctedText),
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(200)
    .all();

  const seen = new Set(skip);
  const items: ReadAloudItem[] = [];
  for (const row of rows) {
    for (const text of readableSentences(row.natural ?? row.corrected ?? "")) {
      if (seen.has(text)) continue;
      seen.add(text);
      items.push({
        key: `correction:${items.length}`,
        text,
        source: "correction",
        sourceId: row.id,
        focus: null,
        target: null,
        confusedWith: null,
      });
      if (items.length >= MAX_ITEMS) return items;
    }
  }
  return items;
}

/** For each word you looked up, the sentence of your corrected message that uses it. */
function vocabularyItems(userId: string, skip: Set<string>): ReadAloudItem[] {
  const rows = db
    .select({ id: schema.vocabulary.id, english: schema.vocabulary.english, corrected: schema.messages.correctedText })
    .from(schema.vocabulary)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.vocabulary.messageId))
    .where(owned(schema.vocabulary, userId))
    .orderBy(desc(schema.vocabulary.createdAt))
    .all();

  const seen = new Set(skip);
  const items: ReadAloudItem[] = [];
  for (const row of rows) {
    const sentences = readableSentences(row.corrected ?? "");
    for (const word of row.english) {
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const text = sentences.find((s) => pattern.test(s));
      if (!text || seen.has(text)) continue;
      seen.add(text);
      items.push({
        key: `vocabulary:${items.length}`,
        text,
        source: "vocabulary",
        sourceId: row.id,
        focus: null,
        target: word,
        confusedWith: null,
      });
      break;
    }
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export interface ReadAloudData {
  sounds: ReadAloudItem[];
  corrections: ReadAloudItem[];
  vocabulary: ReadAloudItem[];
  summary: PronunciationSummary;
}

export function getReadAloudData(userId: string): ReadAloudData {
  const summary = getPronunciationSummary(userId);
  const skip = recentlyRead(userId);
  return {
    sounds: soundItems(soundOrder(summary)),
    corrections: correctionItems(userId, skip),
    vocabulary: vocabularyItems(userId, skip),
    summary,
  };
}

export interface AttemptInput {
  text: string;
  source: ReadAloudSource;
  sourceId: string | null;
  focus: PronunciationCategory | null;
  transcript: string;
  transcriptionProvider: string | null;
  transcriptionModel: string | null;
  audioDurationMs: number | null;
}

/** Scores a reading, saves it with its issues, and returns the result. */
export function saveAttempt(userId: string, input: AttemptInput): ReadAloudResult {
  const result = scoreReading(input.text, input.transcript, cmuLookup);
  const id = crypto.randomUUID();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(schema.readAloudAttempts)
      .values({
        id,
        userId,
        ...input,
        correctWords: result.correctWords,
        totalWords: result.totalWords,
        createdAt: now,
      })
      .run();
    if (result.issues.length > 0) {
      tx.insert(schema.pronunciationIssues)
        .values(
          result.issues.map((issue) => ({ id: crypto.randomUUID(), userId, attemptId: id, createdAt: now, ...issue })),
        )
        .run();
    }
  });
  return result;
}

/** Sentences read with words heard differently, as "Hard to say" flashcards (newest first). */
export function loadPronunciationCards(userId: string): PronunciationCard[] {
  const rows = db
    .select({
      text: schema.readAloudAttempts.text,
      createdAt: schema.readAloudAttempts.createdAt,
      attemptId: schema.readAloudAttempts.id,
      expected: schema.pronunciationIssues.expected,
      heard: schema.pronunciationIssues.heard,
      category: schema.pronunciationIssues.category,
      detail: schema.pronunciationIssues.detail,
    })
    .from(schema.pronunciationIssues)
    .innerJoin(schema.readAloudAttempts, eq(schema.readAloudAttempts.id, schema.pronunciationIssues.attemptId))
    .where(owned(schema.pronunciationIssues, userId))
    .all();
  return pronunciationCards(rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })));
}

/**
 * Deletes every reading of a sentence (with its issues, so it also leaves the
 * pronunciation stats). Returns how many readings went.
 */
export function deleteReadings(userId: string, text: string): number {
  const ids = db
    .select({ id: schema.readAloudAttempts.id, text: schema.readAloudAttempts.text })
    .from(schema.readAloudAttempts)
    .where(owned(schema.readAloudAttempts, userId))
    .all()
    .filter((r) => r.text.replace(/\s+/g, " ").trim() === text)
    .map((r) => r.id);
  if (ids.length > 0)
    db.delete(schema.readAloudAttempts)
      .where(owned(schema.readAloudAttempts, userId, inArray(schema.readAloudAttempts.id, ids)))
      .run();
  return ids.length;
}
