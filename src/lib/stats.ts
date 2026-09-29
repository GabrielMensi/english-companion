import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { computeStats, type StatCorrection, type StatMessage } from "@/lib/stats-core";
import { computeTenseStats, type TenseStatCorrection } from "@/lib/tense-stats";
import { countTenses, TENSE_COUNTER_VERSION, type TenseCounts } from "@/lib/tenses-core";
import { getVocabulary } from "@/lib/vocabulary";

export const RANGES = { "7": 7, "30": 30, "90": 90, all: null } as const;
export type RangeKey = keyof typeof RANGES;

const DAY = 86_400_000;

export function getDashboardData(range: RangeKey) {
  const now = Date.now();
  const days = RANGES[range];
  const from = days === null ? null : now - days * DAY;
  const previousFrom = days === null ? null : now - 2 * days * DAY;

  const settings = getSettings();
  const period = (start: number | null, end: number | null) => ({
    messages: loadMessages(start, end),
    corrections: loadCorrections(start, end),
  });

  const current = period(from, null);
  const previous = from !== null ? period(previousFrom, from) : { messages: [], corrections: [] };

  const stats = computeStats({
    from,
    now,
    countTypos: settings.countTyposInStats,
    messages: current.messages,
    corrections: current.corrections,
    previousMessages: previous.messages,
    previousCorrections: previous.corrections,
  });

  const tenses = computeTenseStats({
    countTypos: settings.countTyposInStats,
    messages: current.messages,
    corrections: current.corrections,
    previousMessages: previous.messages,
    previousCorrections: previous.corrections,
  });

  // Words looked up with [brackets] during the period, grouped and newest first.
  const vocabulary = getVocabulary().filter((w) => from === null || w.lastSeen >= from);

  return { stats, tenses, vocabulary, countTypos: settings.countTyposInStats };
}

function loadMessages(from: number | null, to: number | null): (StatMessage & { tenseCounts: TenseCounts })[] {
  return db
    .select({
      id: schema.messages.id,
      createdAt: schema.messages.createdAt,
      wordCount: schema.messages.wordCount,
      content: schema.messages.content,
      correctedText: schema.messages.correctedText,
      tenseCounts: schema.messages.tenseCounts,
    })
    .from(schema.messages)
    .where(and(eq(schema.messages.role, "user"), eq(schema.messages.status, "done"), ...rangeFilter(schema.messages.createdAt, from, to)))
    .all()
    .map((m) => ({ createdAt: m.createdAt.getTime(), wordCount: m.wordCount, tenseCounts: tenseCountsOf(m) }));
}

/**
 * Tenses in the corrected text, counted once and stored. Messages analyzed
 * before this existed, or counted with an older version of the rules, are
 * counted here the first time the dashboard needs them.
 */
function tenseCountsOf(m: {
  id: string;
  content: string;
  correctedText: string | null;
  tenseCounts: { version: number; counts: TenseCounts } | null;
}): TenseCounts {
  if (m.tenseCounts?.version === TENSE_COUNTER_VERSION) return m.tenseCounts.counts;
  const counts = countTenses(m.correctedText ?? m.content);
  db.update(schema.messages)
    .set({ tenseCounts: { version: TENSE_COUNTER_VERSION, counts } })
    .where(eq(schema.messages.id, m.id))
    .run();
  return counts;
}

function loadCorrections(from: number | null, to: number | null): (StatCorrection & TenseStatCorrection)[] {
  return db
    .select()
    .from(schema.corrections)
    .where(and(...rangeFilter(schema.corrections.createdAt, from, to)))
    .all()
    .map((c) => ({ ...c, createdAt: c.createdAt.getTime() }));
}

function rangeFilter(column: AnySQLiteColumn, from: number | null, to: number | null) {
  return [from !== null ? gte(column, new Date(from)) : undefined, to !== null ? lt(column, new Date(to)) : undefined];
}
