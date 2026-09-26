import "server-only";

import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { computeStats, type StatCorrection, type StatMessage } from "@/lib/stats-core";

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

  const vocabulary = db
    .select()
    .from(schema.vocabulary)
    .where(from !== null ? gte(schema.vocabulary.createdAt, new Date(from)) : undefined)
    .orderBy(desc(schema.vocabulary.createdAt))
    .limit(30)
    .all()
    .map((v) => ({ id: v.id, spanish: v.spanish, english: v.english, note: v.note }));

  return { stats, vocabulary, countTypos: settings.countTyposInStats };
}

function loadMessages(from: number | null, to: number | null): StatMessage[] {
  return db
    .select({ createdAt: schema.messages.createdAt, wordCount: schema.messages.wordCount })
    .from(schema.messages)
    .where(and(eq(schema.messages.role, "user"), eq(schema.messages.status, "done"), ...rangeFilter(schema.messages.createdAt, from, to)))
    .all()
    .map((m) => ({ createdAt: m.createdAt.getTime(), wordCount: m.wordCount }));
}

function loadCorrections(from: number | null, to: number | null): StatCorrection[] {
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
