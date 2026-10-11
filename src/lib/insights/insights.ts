import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { explainLevel, generateStudyPlan } from "@/lib/ai/insights";
import { withChatPriority } from "@/lib/classification";
import { getSettings } from "@/lib/settings";
import { getPronunciationProgress } from "@/lib/read-aloud";
import { getDashboardData } from "@/lib/stats";
import { countTenses, TENSE_COUNTER_VERSION } from "@/lib/tenses-core";
import { buildDigest, type StatsDigest } from "./digest-core";
import {
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

/** AI outputs are cached in the key-value `settings` table, so they survive restarts without a new table. */
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

export function getReportDigest(range: ReportRange): StatsDigest {
  const { stats, tenses, vocabulary } = getDashboardData(range);
  const days = Number(range);
  // Read-aloud readings aren't messages: the written/spoken filter and countsInStats don't apply.
  const pronunciation = getPronunciationProgress(days);
  return buildDigest({ days, now: Date.now(), stats, tenses, vocabulary, pronunciation });
}

export function getStoredPlan(): StoredPlan | null {
  return readStored<StoredPlan>(PLAN_KEY);
}

export async function createStudyPlan(range: ReportRange): Promise<StoredPlan> {
  const digest = getReportDigest(range);
  if (digest.totals.messages === 0) throw new Error("There are no messages in this period yet");
  const { plan, provider, modelId } = await withChatPriority(() => generateStudyPlan(digest, getSettings()));
  const stored: StoredPlan = { plan, digest, generatedAt: Date.now(), provider, modelId };
  writeStored(PLAN_KEY, stored);
  return stored;
}

export interface LevelData {
  estimate: LevelEstimate;
  evolution: LevelWindow[];
  /** The AI explanation, when there's one for this level and roughly this much writing. */
  explanation: StoredLevelExplanation | null;
}

export function getLevelData(): LevelData {
  const settings = getSettings();
  const { messages, corrections, lookupsByMessage } = loadLevelInput();
  const window = recentWindow(messages);
  const ids = new Set(window.map((m) => m.id));
  const estimate = estimateLevel({
    messages: window,
    corrections: corrections.filter((c) => ids.has(c.messageId)),
    countTypos: settings.countTyposInStats,
    lookups: window.reduce((n, m) => n + (lookupsByMessage.get(m.id) ?? 0), 0),
  });
  const evolution = levelEvolution({ messages, corrections, countTypos: settings.countTyposInStats });
  const stored = readStored<StoredLevelExplanation>(LEVEL_KEY);
  return { estimate, evolution, explanation: isExplanationCurrent(stored, estimate) ? stored : null };
}

export async function createLevelExplanation(): Promise<StoredLevelExplanation> {
  const { estimate, evolution } = getLevelData();
  if (estimate.level === null) throw new Error(`Write about ${estimate.wordsNeeded} more words to get an estimate`);
  const { explanation, provider, modelId } = await withChatPriority(() =>
    explainLevel(estimate, evolution, getSettings()),
  );
  const stored: StoredLevelExplanation = {
    explanation,
    level: estimate.level,
    words: estimate.words,
    generatedAt: Date.now(),
    provider,
    modelId,
  };
  writeStored(LEVEL_KEY, stored);
  return stored;
}

function loadLevelInput() {
  const messages: LevelMessage[] = db
    .select({
      id: schema.messages.id,
      createdAt: schema.messages.createdAt,
      wordCount: schema.messages.wordCount,
      content: schema.messages.content,
      correctedText: schema.messages.correctedText,
      inputMode: schema.messages.inputMode,
      tenseCounts: schema.messages.tenseCounts,
    })
    .from(schema.messages)
    .where(and(eq(schema.messages.role, "user"), eq(schema.messages.status, "done")))
    .all()
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
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .all();

  const lookupsByMessage = new Map<string, number>();
  for (const row of db.select({ messageId: schema.vocabulary.messageId }).from(schema.vocabulary).all()) {
    lookupsByMessage.set(row.messageId, (lookupsByMessage.get(row.messageId) ?? 0) + 1);
  }
  return { messages, corrections, lookupsByMessage };
}

function readStored<T>(key: string): T | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row ? (row.value as T) : null;
}

function writeStored(key: string, value: unknown) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
