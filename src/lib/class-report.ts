import "server-only";

import { generateClassQuestions } from "@/lib/ai/class";
import { listClassSessions, toMeeting } from "@/lib/class";
import {
  type ClassQuestions,
  type PeriodRequest,
  periodKey,
  resolveReportPeriod,
  type ReportPeriod,
  withPeriod,
} from "@/lib/class-core";
import { buildDigest, type StatsDigest } from "@/lib/insights/digest-core";
import { getLevelData } from "@/lib/insights/insights";
import { getSettings } from "@/lib/settings";
import { getPeriodData } from "@/lib/stats";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

const DAY = 86_400_000;
const QUESTIONS_KEY = "class-report-questions";

export interface StoredQuestions extends ClassQuestions {
  key: string;
  generatedAt: number;
  provider: string;
  modelId: string;
}

export interface ClassReport {
  period: ReportPeriod;
  digest: StatsDigest;
  /** The questions written for this exact period and data, if any. */
  questions: StoredQuestions | null;
  teacher: ReturnType<typeof getLevelData>["teacher"];
  appLevel: ReturnType<typeof getLevelData>["estimate"]["level"];
  /** Classes the learner can start the report from, newest first. */
  meetings: { id: string; heldAt: number }[];
}

/**
 * The report to take to class: the stats of the period (since the last class by default) of what the
 * learner wrote, without what the teacher corrected in class (they already know it).
 */
export function getClassReport(userId: string, request: PeriodRequest): ClassReport {
  const now = Date.now();
  const meetings = listClassSessions(userId).map(toMeeting);
  const period = resolveReportPeriod(meetings, request, now);
  const length = period.to - period.from;
  const { stats, tenses, vocabulary } = getPeriodData(
    userId,
    { from: period.from, to: period.to, previousFrom: period.from - length, now },
    "all",
    { withoutClass: true },
  );
  const digest = withPeriod(
    buildDigest({ days: Math.ceil(length / DAY), now: period.to, stats, tenses, vocabulary, pronunciation: null }),
    period,
  );
  const stored = getUserSetting(userId, QUESTIONS_KEY) as StoredQuestions | undefined;
  const level = getLevelData(userId);
  return {
    period,
    digest,
    questions: stored && stored.key === periodKey(period, digest.totals.errors) ? stored : null,
    teacher: level.teacher,
    appLevel: level.estimate.level,
    meetings: meetings.sort((a, b) => b.heldAt - a.heldAt).map(({ id, heldAt }) => ({ id, heldAt })),
  };
}

/** Writes (and keeps) "what to ask the teacher" for the period. */
export async function createClassQuestions(userId: string, request: PeriodRequest): Promise<StoredQuestions> {
  const { period, digest } = getClassReport(userId, request);
  if (digest.totals.errors === 0 && digest.vocabulary.length === 0) {
    throw new Error("There are no mistakes or words in this period yet");
  }
  const { questions, provider, modelId } = await generateClassQuestions(userId, digest, getSettings(userId));
  const stored: StoredQuestions = {
    questions,
    key: periodKey(period, digest.totals.errors),
    generatedAt: Date.now(),
    provider,
    modelId,
  };
  setUserSetting(userId, QUESTIONS_KEY, stored);
  return stored;
}
