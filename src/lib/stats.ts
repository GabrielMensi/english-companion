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

/** Which messages the dashboard looks at: all, only typed or only dictated. */
export const INPUT_FILTERS = ["all", "typed", "spoken"] as const;
export type InputFilter = (typeof INPUT_FILTERS)[number];

const DAY = 86_400_000;

export function getDashboardData(range: RangeKey, input: InputFilter = "all") {
  const now = Date.now();
  const days = RANGES[range];
  const from = days === null ? null : now - days * DAY;
  const previousFrom = days === null ? null : now - 2 * days * DAY;

  const settings = getSettings();
  const period = (start: number | null, end: number | null) => ({
    messages: loadMessages(start, end, input),
    corrections: loadCorrections(start, end, input),
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

  return { stats, tenses, vocabulary, countTypos: settings.countTyposInStats, hasSpoken: hasSpokenMessages() };
}

function hasSpokenMessages(): boolean {
  return (
    db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.inputMode, "spoken"))
      .limit(1)
      .get() !== undefined
  );
}

function inputFilter(input: InputFilter) {
  return input === "all" ? undefined : eq(schema.messages.inputMode, input);
}

function loadMessages(
  from: number | null,
  to: number | null,
  input: InputFilter,
): (StatMessage & { tenseCounts: TenseCounts })[] {
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
    .where(
      and(
        eq(schema.messages.role, "user"),
        eq(schema.messages.status, "done"),
        inputFilter(input),
        ...rangeFilter(schema.messages.createdAt, from, to),
      ),
    )
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

function loadCorrections(
  from: number | null,
  to: number | null,
  input: InputFilter,
): (StatCorrection & TenseStatCorrection)[] {
  return db
    .select({ correction: schema.corrections, inputMode: schema.messages.inputMode })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(and(inputFilter(input), ...rangeFilter(schema.corrections.createdAt, from, to)))
    .all()
    .map(({ correction, inputMode }) => ({ ...correction, inputMode, createdAt: correction.createdAt.getTime() }));
}

function rangeFilter(column: AnySQLiteColumn, from: number | null, to: number | null) {
  return [from !== null ? gte(column, new Date(from)) : undefined, to !== null ? lt(column, new Date(to)) : undefined];
}
