import "server-only";

import { eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { classChatIds, getTeacherLevel } from "@/lib/class";
import { compareWithTeacher, type TeacherComparison } from "@/lib/class-core";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";
import { explainLevel, generateStudyPlan } from "@/lib/ai/insights";
import { withChatPriority } from "@/lib/classification";
import { getSettings } from "@/lib/settings";
import { getPronunciationProgress } from "@/lib/read-aloud";
import { getDashboardData } from "@/lib/stats";
import { countTenses, TENSE_COUNTER_VERSION } from "@/lib/tenses-core";
import { buildDigest, type StatsDigest } from "./digest-core";
import {
  type CefrLevel,
  estimateLevel,
  type LevelCorrection,
  type LevelEstimate,
  levelEvolution,
  type LevelMessage,
  type LevelWindow,
  recentWindow,
} from "./level-core";
import { isExplanationCurrent, type LevelExplanation, type StudyPlan } from "./plan-core";

/** Periods the report can cover, in days (keys of the dashboard's ranges). */
export const REPORT_RANGES = ["7", "30"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

/** AI outputs are cached in the user's key-value `user_settings` table, so they survive restarts without a new table. */
const PLAN_KEY = "insights-plan";
const LEVEL_KEY = "insights-level-explanation";

export interface StoredPlan {
  plan: StudyPlan;
  /** The digest the plan was written from, so it can be shown and exported together. */
  digest: StatsDigest;
  generatedAt: number;
  provider: string;
  modelId: string;
}

export interface StoredLevelExplanation {
  explanation: LevelExplanation;
  level: string;
  words: number;
  generatedAt: number;
  provider: string;
  modelId: string;
}

/** `withPronunciation: false` skips the read-aloud queries, for callers that only use the totals. */
export function getReportDigest(userId: string, range: ReportRange, { withPronunciation = true } = {}): StatsDigest {
  const { stats, tenses, vocabulary } = getDashboardData(userId, range);
  const days = Number(range);
  // Read-aloud readings aren't messages: the written/spoken filter and countsInStats don't apply.
  const pronunciation = withPronunciation ? getPronunciationProgress(userId, days) : null;
  return buildDigest({ days, now: Date.now(), stats, tenses, vocabulary, pronunciation });
}

export function getStoredPlan(userId: string): StoredPlan | null {
  return readStored<StoredPlan>(userId, PLAN_KEY);
}

export async function createStudyPlan(userId: string, range: ReportRange): Promise<StoredPlan> {
  const digest = getReportDigest(userId, range);
  if (digest.totals.messages === 0) throw new Error("There are no messages in this period yet");
  const { plan, provider, modelId } = await withChatPriority(userId, () =>
    generateStudyPlan(digest, getSettings(userId)),
  );
  const stored: StoredPlan = { plan, digest, generatedAt: Date.now(), provider, modelId };
  writeStored(userId, PLAN_KEY, stored);
  return stored;
}

export interface LevelData {
  estimate: LevelEstimate;
  evolution: LevelWindow[];
  /** The AI explanation, when there's one for this level and roughly this much writing. */
  explanation: StoredLevelExplanation | null;
  /** What the teacher said in the latest class that gave a level, compared with the estimate. */
  teacher: { level: CefrLevel; heldAt: number; comparison: TeacherComparison | null } | null;
}

export function getLevelData(userId: string): LevelData {
  const settings = getSettings(userId);
  const { messages, corrections, lookupsByMessage } = loadLevelInput(userId);
  const window = recentWindow(messages);
  const ids = new Set(window.map((m) => m.id));
  const estimate = estimateLevel({
    messages: window,
    corrections: corrections.filter((c) => ids.has(c.messageId)),
    countTypos: settings.countTyposInStats,
    lookups: window.reduce((n, m) => n + (lookupsByMessage.get(m.id) ?? 0), 0),
  });
  const evolution = levelEvolution({ messages, corrections, countTypos: settings.countTyposInStats });
  const stored = readStored<StoredLevelExplanation>(userId, LEVEL_KEY);
  const teacher = getTeacherLevel(userId);
  return {
    estimate,
    evolution,
    explanation: isExplanationCurrent(stored, estimate) ? stored : null,
    teacher: teacher && { ...teacher, comparison: compareWithTeacher(estimate, teacher.level) },
  };
}

export async function createLevelExplanation(userId: string): Promise<StoredLevelExplanation> {
  const { estimate, evolution } = getLevelData(userId);
  if (estimate.level === null) throw new Error(`Write about ${estimate.wordsNeeded} more words to get an estimate`);
  const { explanation, provider, modelId } = await withChatPriority(userId, () =>
    explainLevel(estimate, evolution, getSettings(userId)),
  );
  const stored: StoredLevelExplanation = {
    explanation,
    level: estimate.level,
    words: estimate.words,
    generatedAt: Date.now(),
    provider,
    modelId,
  };
  writeStored(userId, LEVEL_KEY, stored);
  return stored;
}

function loadLevelInput(userId: string) {
  const classChats = new Set(classChatIds(userId));
  const messages: LevelMessage[] = db
    .select({
      id: schema.messages.id,
      sessionId: schema.messages.sessionId,
      createdAt: schema.messages.createdAt,
      wordCount: schema.messages.wordCount,
      content: schema.messages.content,
      correctedText: schema.messages.correctedText,
      inputMode: schema.messages.inputMode,
      tenseCounts: schema.messages.tenseCounts,
    })
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.role, "user"), eq(schema.messages.status, "done")))
    .all()
    // What the teacher corrected in class never feeds the estimate: it is compared with the teacher's level.
    .filter((m) => !classChats.has(m.sessionId))
    .map((m) => ({
      id: m.id,
      createdAt: m.createdAt.getTime(),
      wordCount: m.wordCount,
      text: m.content,
      inputMode: m.inputMode,
      // The dashboard stores these; count in memory the ones it hasn't reached yet.
      tenseCounts:
        m.tenseCounts?.version === TENSE_COUNTER_VERSION
          ? m.tenseCounts.counts
          : countTenses(m.correctedText ?? m.content),
    }));

  const corrections: LevelCorrection[] = db
    .select({
      messageId: schema.corrections.messageId,
      severity: schema.corrections.severity,
      category: schema.corrections.category,
      inputMode: schema.messages.inputMode,
      discardedAt: schema.corrections.discardedAt,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(owned(schema.corrections, userId, ne(schema.corrections.source, "class")))
    .all();

  const lookupsByMessage = new Map<string, number>();
  for (const row of db
    .select({ messageId: schema.vocabulary.messageId })
    .from(schema.vocabulary)
    .where(owned(schema.vocabulary, userId, ne(schema.vocabulary.source, "class")))
    .all()) {
    lookupsByMessage.set(row.messageId, (lookupsByMessage.get(row.messageId) ?? 0) + 1);
  }
  return { messages, corrections, lookupsByMessage };
}

function readStored<T>(userId: string, key: string): T | null {
  return (getUserSetting(userId, key) as T | undefined) ?? null;
}

function writeStored(userId: string, key: string, value: unknown) {
  setUserSetting(userId, key, value);
}
