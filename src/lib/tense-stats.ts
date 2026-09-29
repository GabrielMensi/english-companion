/**
 * Pure per-tense statistics: how often each tense was needed (counted in the
 * corrected text), how often it went wrong, and which tenses the learner used
 * instead. Mistakes only count once the deferred classifier assigned a tense.
 */
import { countsAsMistake, type ErrorCategory, type Severity, type Tense, TENSE_CATEGORIES, TENSES } from "@/lib/taxonomy";
import type { TenseCounts } from "@/lib/tenses-core";

export interface TenseStatMessage {
  tenseCounts: TenseCounts;
  wordCount: number;
}

export interface TenseStatCorrection {
  createdAt: number;
  category: ErrorCategory;
  severity: Severity;
  tense: Tense | null;
  tenseUsed: Tense | null;
  classification: string;
  original: string;
  correction: string;
}

export type TenseStatus = "strong" | "shaky" | "weak" | "not_enough_data" | "avoided";

export interface TenseStat {
  tense: Tense;
  /** Times the tense was needed (at least the number of mistakes). */
  uses: number;
  /** Another tense was used where this one was needed. */
  usageErrors: number;
  /** The right tense, formed wrong ("have wrote", "he go"). */
  formErrors: number;
  /** % of uses without mistakes; null with too few uses to say. */
  accuracy: number | null;
  /** Accuracy with a small prior, so 1 use out of 1 isn't "100 %". Used to rank and classify. */
  smoothedAccuracy: number;
  /** Change in accuracy vs the previous period, in percentage points. */
  trend: number | null;
  status: TenseStatus;
  /** Tenses used instead of this one, most frequent first. */
  confusedWith: { tense: Tense; count: number; example: { original: string; correction: string } }[];
}

export interface TenseStats {
  tenses: TenseStat[];
  /** Verb mistakes waiting for the classifier, not counted yet. */
  unclassified: number;
}

export const MIN_USES = 5;
const STRONG_USES = 15;
const STRONG_ACCURACY = 0.9;
const WEAK_ACCURACY = 0.75;
/** Common tenses that are suspicious if they barely appear in this many words. */
const AVOIDED_MIN_WORDS = 1000;
const COMMON_TENSES: readonly Tense[] = ["past_simple", "present_perfect", "present_continuous", "future_will", "future_going_to"];

/**
 * The counter can't tell "I'm meeting him tomorrow" from "I'm meeting him now",
 * so both are measured as present continuous.
 */
const MEASURED_AS: Partial<Record<Tense, Tense>> = { future_present_continuous: "present_continuous" };
const measured = (tense: Tense) => MEASURED_AS[tense] ?? tense;

export function computeTenseStats(input: {
  countTypos: boolean;
  messages: TenseStatMessage[];
  corrections: TenseStatCorrection[];
  previousMessages: TenseStatMessage[];
  previousCorrections: TenseStatCorrection[];
}): TenseStats {
  const current = aggregate(input.messages, input.corrections, input.countTypos);
  const previous = aggregate(input.previousMessages, input.previousCorrections, input.countTypos);
  const words = input.messages.reduce((sum, m) => sum + m.wordCount, 0);

  const tenses: TenseStat[] = [];
  for (const tense of TENSES) {
    if (MEASURED_AS[tense]) continue;
    const data = current.get(tense);
    const uses = data?.uses ?? 0;
    const errors = data ? data.usageErrors + data.formErrors : 0;
    const avoided = COMMON_TENSES.includes(tense) && words >= AVOIDED_MIN_WORDS && uses <= 1;
    if (uses === 0 && !avoided) continue;

    const accuracy = uses >= MIN_USES ? (uses - errors) / uses : null;
    const smoothed = (uses - errors + 1) / (uses + 2);
    const before = previous.get(tense);
    const previousAccuracy =
      before && before.uses >= MIN_USES ? (before.uses - before.usageErrors - before.formErrors) / before.uses : null;

    tenses.push({
      tense,
      uses,
      usageErrors: data?.usageErrors ?? 0,
      formErrors: data?.formErrors ?? 0,
      accuracy: accuracy === null ? null : round(accuracy * 100),
      smoothedAccuracy: round(smoothed * 100),
      trend: accuracy !== null && previousAccuracy !== null ? round((accuracy - previousAccuracy) * 100) : null,
      status: status(uses, smoothed, avoided),
      confusedWith: [...(data?.confusions.values() ?? [])].sort((a, b) => b.count - a.count || b.last - a.last).map(
        ({ tense: t, count, example }) => ({ tense: t, count, example }),
      ),
    });
  }

  const unclassified = input.corrections.filter(
    (c) =>
      countsAsMistake(c.severity, input.countTypos) &&
      c.classification === "pending" &&
      TENSE_CATEGORIES.includes(c.category),
  ).length;

  return { tenses, unclassified };
}

interface Aggregate {
  uses: number;
  usageErrors: number;
  formErrors: number;
  confusions: Map<Tense, { tense: Tense; count: number; last: number; example: { original: string; correction: string } }>;
}

function aggregate(messages: TenseStatMessage[], corrections: TenseStatCorrection[], countTypos: boolean) {
  const map = new Map<Tense, Aggregate>();
  const get = (tense: Tense) => {
    let entry = map.get(tense);
    if (!entry) {
      entry = { uses: 0, usageErrors: 0, formErrors: 0, confusions: new Map() };
      map.set(tense, entry);
    }
    return entry;
  };

  for (const m of messages) {
    for (const [tense, n] of Object.entries(m.tenseCounts) as [Tense, number][]) get(measured(tense)).uses += n;
  }

  for (const c of corrections) {
    if (!c.tense || !countsAsMistake(c.severity, countTypos)) continue;
    const entry = get(measured(c.tense));
    const used = c.tenseUsed ? measured(c.tenseUsed) : null;
    if (used && used !== measured(c.tense)) {
      entry.usageErrors++;
      const confusion = entry.confusions.get(used);
      const example = { original: c.original, correction: c.correction };
      if (!confusion) entry.confusions.set(used, { tense: used, count: 1, last: c.createdAt, example });
      else {
        confusion.count++;
        if (c.createdAt > confusion.last) Object.assign(confusion, { last: c.createdAt, example });
      }
    } else {
      entry.formErrors++;
    }
  }

  // Every mistake's corrected form is a use; the counter can miss some.
  for (const entry of map.values()) entry.uses = Math.max(entry.uses, entry.usageErrors + entry.formErrors);
  return map;
}

function status(uses: number, smoothed: number, avoided: boolean): TenseStatus {
  if (avoided) return "avoided";
  if (uses < MIN_USES) return "not_enough_data";
  if (smoothed >= STRONG_ACCURACY && uses >= STRONG_USES) return "strong";
  return smoothed < WEAK_ACCURACY ? "weak" : "shaky";
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
