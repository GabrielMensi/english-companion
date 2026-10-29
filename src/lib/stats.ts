import "server-only";

import { eq, gt, gte, isNotNull, lt, ne, notInArray } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { computeFluencyStats } from "@/lib/fluency";
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

export function getDashboardData(userId: string, range: RangeKey, input: InputFilter = "all") {
  const now = Date.now();
  const days = RANGES[range];
  const from = days === null ? null : now - days * DAY;
  return getPeriodData(
    userId,
    { from, to: null, previousFrom: days === null ? null : now - 2 * days * DAY, now },
    input,
  );
}

/** Everything the dashboard shows, for any period. `withoutClass` leaves out what the teacher corrected in class. */
export function getPeriodData(
  userId: string,
  { from, to, previousFrom, now }: { from: number | null; to: number | null; previousFrom: number | null; now: number },
  input: InputFilter = "all",
  { withoutClass = false } = {},
) {
  const settings = getSettings(userId);
  const classChats = withoutClass ? classChatIds(userId) : [];
  const period = (start: number | null, end: number | null) => ({
    messages: loadMessages(userId, start, end, input, classChats),
    corrections: loadCorrections(userId, start, end, input, withoutClass),
  });

  const current = period(from, to);
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

  // Fluency only exists for dictated messages, so the written/spoken filter doesn't change it.
  const fluency = computeFluencyStats(
    loadFluency(userId, from, to),
    from !== null ? loadFluency(userId, previousFrom, from) : [],
  );

  // Words looked up with [brackets] during the period, grouped and newest first.
  const vocabulary = getVocabulary(userId).filter(
    (w) =>
      (from === null || w.lastSeen >= from) &&
      (to === null || w.lastSeen < to) &&
      !(withoutClass && w.source === "class"),
  );

  return {
    stats,
    tenses,
    vocabulary,
    fluency,
    countTypos: settings.countTyposInStats,
    hasSpoken: hasSpokenMessages(userId),
  };
}

/** The hidden chats that hold what the teacher corrected in class. */
function classChatIds(userId: string): string[] {
  return db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(owned(schema.sessions, userId, eq(schema.sessions.mode, "class")))
    .all()
    .map((s) => s.id);
}

function hasSpokenMessages(userId: string): boolean {
  return (
    db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(owned(schema.messages, userId, eq(schema.messages.inputMode, "spoken")))
      .limit(1)
      .get() !== undefined
  );
}

function loadFluency(userId: string, from: number | null, to: number | null) {
  return db
    .select({ fluency: schema.messages.fluency })
    .from(schema.messages)
    .where(
      owned(
        schema.messages,
        userId,
        eq(schema.messages.role, "user"),
        eq(schema.messages.inputMode, "spoken"),
        isNotNull(schema.messages.fluency),
        ...rangeFilter(schema.messages.createdAt, from, to),
      ),
    )
    .all();
}

function inputFilter(input: InputFilter) {
  return input === "all" ? undefined : eq(schema.messages.inputMode, input);
}

function loadMessages(
  userId: string,
  from: number | null,
  to: number | null,
  input: InputFilter,
  classChats: string[] = [],
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
      owned(
        schema.messages,
        userId,
        eq(schema.messages.role, "user"),
        eq(schema.messages.status, "done"),
        // A load with only words from class has no words of the learner's: not a message.
        gt(schema.messages.wordCount, 0),
        classChats.length > 0 ? notInArray(schema.messages.sessionId, classChats) : undefined,
        inputFilter(input),
        ...rangeFilter(schema.messages.createdAt, from, to),
      ),
    )
    .all()
    .map((m) => ({ createdAt: m.createdAt.getTime(), wordCount: m.wordCount, tenseCounts: tenseCountsOf(userId, m) }));
}

/**
 * Tenses in the corrected text, counted once and stored. Messages analyzed
 * before this existed, or counted with an older version of the rules, are
 * counted here the first time the dashboard needs them.
 */
function tenseCountsOf(
  userId: string,
  m: {
    id: string;
    content: string;
    correctedText: string | null;
    tenseCounts: { version: number; counts: TenseCounts } | null;
  },
): TenseCounts {
  if (m.tenseCounts?.version === TENSE_COUNTER_VERSION) return m.tenseCounts.counts;
  const counts = countTenses(m.correctedText ?? m.content);
  db.update(schema.messages)
    .set({ tenseCounts: { version: TENSE_COUNTER_VERSION, counts } })
    .where(owned(schema.messages, userId, eq(schema.messages.id, m.id)))
    .run();
  return counts;
}

function loadCorrections(
  userId: string,
  from: number | null,
  to: number | null,
  input: InputFilter,
  withoutClass = false,
): (StatCorrection & TenseStatCorrection)[] {
  return db
    .select({ correction: schema.corrections, inputMode: schema.messages.inputMode })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(
      owned(
        schema.corrections,
        userId,
        withoutClass ? ne(schema.corrections.source, "class") : undefined,
        inputFilter(input),
        ...rangeFilter(schema.corrections.createdAt, from, to),
      ),
    )
    .all()
    .map(({ correction, inputMode }) => ({
      ...correction,
      inputMode,
      createdAt: correction.createdAt.getTime(),
      discardedAt: correction.discardedAt?.getTime() ?? null,
    }));
}

function rangeFilter(column: AnySQLiteColumn, from: number | null, to: number | null) {
  return [from !== null ? gte(column, new Date(from)) : undefined, to !== null ? lt(column, new Date(to)) : undefined];
}
