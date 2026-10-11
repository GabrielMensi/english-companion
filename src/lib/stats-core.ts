/**
 * Pure statistics computation for the dashboard. Data volume is personal-scale,
 * so everything is computed in memory from the raw rows of the period.
 */
import type { InputMode } from "@/db/schema";
import {
  countsInStats,
  type ErrorCategory,
  isDiscarded,
  SEVERITIES,
  type Severity,
  SEVERITY_WEIGHTS,
} from "@/lib/taxonomy";

export interface StatMessage {
  createdAt: number;
  wordCount: number;
}

export interface StatCorrection {
  messageId: string;
  createdAt: number;
  category: ErrorCategory;
  subcategory: string;
  /** Fixed fine-grained type, null until the classifier gets to it. */
  subtype: string | null;
  severity: Severity;
  original: string;
  correction: string;
  explanation: string;
  /** Mistakes in dictated messages only count in categories speech-to-text can measure. */
  inputMode: InputMode;
  /** Discarded by the learner as a wrong correction: left out of every number. */
  discardedAt: number | null;
}

export interface StatsInput {
  /** Start of the selected period (ms), or null for "all time". */
  from: number | null;
  now: number;
  countTypos: boolean;
  /** Rows from the selected period. */
  messages: StatMessage[];
  corrections: StatCorrection[];
  /** Rows from the equally long period before `from`, used for trends. */
  previousMessages: StatMessage[];
  previousCorrections: StatCorrection[];
}

export interface CategoryStat {
  category: ErrorCategory;
  count: number;
  /** Severity-weighted score: the higher, the weaker the area. */
  score: number;
  per100Words: number;
  /** Change in errors per 100 words vs the previous period (null if no data). */
  trend: number | null;
  bySeverity: Record<Severity, number>;
  /** Most frequent classified types in the category, most frequent first. */
  topSubtypes: { subtype: string; count: number }[];
}

export interface Stats {
  totals: {
    messages: number;
    words: number;
    errors: number;
    typos: number;
    per100Words: number;
    cleanMessagesPct: number;
    previousPer100Words: number | null;
  };
  bySeverity: Record<Severity, number>;
  categories: CategoryStat[];
  timeline: { bucket: string; words: number; errors: number; per100Words: number }[];
  topMistakes: {
    category: ErrorCategory;
    /** The fixed type when classified; otherwise the model's free label in `subcategory`. */
    subtype: string | null;
    subcategory: string;
    count: number;
    example: { original: string; correction: string; explanation: string };
  }[];
}

const DAY = 86_400_000;

export function computeStats(input: StatsInput): Stats {
  const counted = input.corrections.filter((c) => countsInStats(c, input.countTypos));
  const previousCounted = input.previousCorrections.filter((c) => countsInStats(c, input.countTypos));

  const words = sum(input.messages.map((m) => m.wordCount));
  const previousWords = sum(input.previousMessages.map((m) => m.wordCount));

  const bySeverity = emptySeverityRecord();
  for (const c of input.corrections) if (!isDiscarded(c)) bySeverity[c.severity]++;

  const messagesWithErrors = new Set(counted.map((c) => c.messageId)).size;

  return {
    totals: {
      messages: input.messages.length,
      words,
      errors: counted.length,
      typos: bySeverity.typo,
      per100Words: rate(counted.length, words),
      cleanMessagesPct:
        input.messages.length === 0
          ? 0
          : round(((input.messages.length - messagesWithErrors) / input.messages.length) * 100),
      previousPer100Words: previousWords > 0 ? rate(previousCounted.length, previousWords) : null,
    },
    bySeverity,
    categories: categoryStats(counted, previousCounted, words, previousWords),
    timeline: timeline(input, counted),
    topMistakes: topMistakes(counted),
  };
}

function categoryStats(
  counted: StatCorrection[],
  previousCounted: StatCorrection[],
  words: number,
  previousWords: number,
): CategoryStat[] {
  const map = new Map<ErrorCategory, CategoryStat>();
  const subtypeCounts = new Map<ErrorCategory, Map<string, number>>();
  for (const c of counted) {
    let stat = map.get(c.category);
    if (!stat) {
      stat = emptyCategoryStat(c.category);
      map.set(c.category, stat);
    }
    stat.count++;
    stat.score += SEVERITY_WEIGHTS[c.severity];
    stat.bySeverity[c.severity]++;
    if (c.subtype) {
      const counts = subtypeCounts.get(c.category) ?? new Map<string, number>();
      counts.set(c.subtype, (counts.get(c.subtype) ?? 0) + 1);
      subtypeCounts.set(c.category, counts);
    }
  }
  for (const [category, counts] of subtypeCounts) {
    map.get(category)!.topSubtypes = [...counts.entries()]
      .map(([subtype, count]) => ({ subtype, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  const previousCounts = new Map<ErrorCategory, number>();
  for (const c of previousCounted) previousCounts.set(c.category, (previousCounts.get(c.category) ?? 0) + 1);

  // Categories that had errors before but none now are improvements worth showing.
  for (const category of previousCounts.keys()) {
    if (!map.has(category)) {
      map.set(category, emptyCategoryStat(category));
    }
  }

  for (const stat of map.values()) {
    stat.per100Words = rate(stat.count, words);
    if (previousWords > 0 && words > 0) {
      stat.trend = round(stat.per100Words - rate(previousCounts.get(stat.category) ?? 0, previousWords));
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score || b.count - a.count);
}

function timeline(input: StatsInput, counted: StatCorrection[]) {
  const all = [...input.messages.map((m) => m.createdAt), ...counted.map((c) => c.createdAt)];
  if (all.length === 0) return [];

  const start = input.from ?? Math.min(...all);
  const spanDays = (input.now - start) / DAY;
  const weekly = spanDays > 45;
  const key = (ms: number) => bucketKey(ms, weekly);

  const buckets = new Map<string, { words: number; errors: number }>();
  // Pre-fill so days without activity show up as gaps in the chart.
  for (let t = start; t <= input.now; t += weekly ? 7 * DAY : DAY) {
    buckets.set(key(t), { words: 0, errors: 0 });
  }
  buckets.set(key(input.now), buckets.get(key(input.now)) ?? { words: 0, errors: 0 });

  for (const m of input.messages) {
    const b = buckets.get(key(m.createdAt)) ?? { words: 0, errors: 0 };
    b.words += m.wordCount;
    buckets.set(key(m.createdAt), b);
  }
  for (const c of counted) {
    const b = buckets.get(key(c.createdAt)) ?? { words: 0, errors: 0 };
    b.errors++;
    buckets.set(key(c.createdAt), b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, b]) => ({ bucket, ...b, per100Words: rate(b.errors, b.words) }));
}

function topMistakes(counted: StatCorrection[]): Stats["topMistakes"] {
  const map = new Map<string, Stats["topMistakes"][number] & { last: number }>();
  for (const c of counted) {
    // Classified mistakes group by their fixed type; the rest by the model's free label.
    const k = c.subtype ? `${c.category}/${c.subtype}` : `${c.category}/free:${c.subcategory}`;
    const entry = map.get(k);
    const example = { original: c.original, correction: c.correction, explanation: c.explanation };
    if (!entry) {
      map.set(k, {
        category: c.category,
        subtype: c.subtype,
        subcategory: c.subcategory,
        count: 1,
        example,
        last: c.createdAt,
      });
    } else {
      entry.count++;
      if (c.createdAt > entry.last) {
        entry.example = example;
        entry.last = c.createdAt;
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, 10)
    .map(({ category, subtype, subcategory, count, example }) => ({ category, subtype, subcategory, count, example }));
}

/** Local-date bucket key: YYYY-MM-DD (weekly buckets use the week's Monday). */
export function bucketKey(ms: number, weekly: boolean): string {
  const d = new Date(ms);
  if (weekly) {
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyCategoryStat(category: ErrorCategory): CategoryStat {
  return {
    category,
    count: 0,
    score: 0,
    per100Words: 0,
    trend: null,
    bySeverity: emptySeverityRecord(),
    topSubtypes: [],
  };
}

function emptySeverityRecord(): Record<Severity, number> {
  return Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
}

function rate(errors: number, words: number): number {
  return words > 0 ? round((errors / words) * 100) : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
