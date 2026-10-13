/**
 * Pure "stats digest": a compact summary of a period (categories, trends,
 * tenses, frequent mistakes and vocabulary) built from the dashboard's stats.
 * It's the shared base of the weekly report / study plan and of the report to
 * take to class: the page renders it, the model reads it as text and it can be
 * copied as Markdown.
 */
import type { Stats } from "@/lib/stats-core";
import { categoryLabel, type ErrorCategory, subtypeLabel, type Tense, tenseLabel } from "@/lib/taxonomy";
import type { TenseStats } from "@/lib/tense-stats";
import type { VocabularyWord } from "@/lib/vocabulary-core";

export interface DigestArea {
  category: ErrorCategory;
  label: string;
  count: number;
  per100Words: number;
  /** Change in mistakes per 100 words vs the previous period; null without data. */
  trend: number | null;
  /** Most frequent fixed types in the category. */
  types: string[];
}

export interface DigestTense {
  tense: Tense;
  label: string;
  status: "weak" | "shaky" | "avoided";
  uses: number;
  /** % of uses without mistakes; null with too few uses. */
  accuracy: number | null;
  /** The tense used instead most often, when there's one. */
  confusedWith: string | null;
  example: { original: string; correction: string } | null;
}

export interface DigestMistake {
  label: string;
  category: string;
  count: number;
  original: string;
  correction: string;
  explanation: string;
}

export interface StatsDigest {
  period: { days: number | null; from: number | null; to: number };
  totals: {
    messages: number;
    words: number;
    errors: number;
    per100Words: number;
    previousPer100Words: number | null;
    cleanMessagesPct: number;
  };
  /** Weakest areas (severity-weighted), weakest first. */
  weakest: DigestArea[];
  /** Areas with clearly more / fewer mistakes than the previous period. */
  worsened: DigestArea[];
  improved: DigestArea[];
  tenses: DigestTense[];
  /** Verb mistakes the classifier hasn't looked at yet (not in the tense stats). */
  unclassifiedTenses: number;
  topMistakes: DigestMistake[];
  vocabulary: { spanish: string; english: string; times: number }[];
}

/** A change in mistakes per 100 words smaller than this is noise. */
export const TREND_THRESHOLD = 0.3;
const MAX_AREAS = 5;
const MAX_MISTAKES = 6;
const MAX_WORDS = 10;

export function buildDigest(input: {
  days: number | null;
  now: number;
  stats: Stats;
  tenses: TenseStats;
  vocabulary: VocabularyWord[];
}): StatsDigest {
  const { stats } = input;
  const areas = stats.categories.map((c): DigestArea => ({
    category: c.category,
    label: categoryLabel(c.category),
    count: c.count,
    per100Words: c.per100Words,
    trend: c.trend,
    types: c.topSubtypes.map((t) => subtypeLabel(c.category, t.subtype) ?? t.subtype),
  }));

  const tenses = input.tenses.tenses
    .filter((t) => t.status === "weak" || t.status === "shaky" || t.status === "avoided")
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.smoothedAccuracy - b.smoothedAccuracy)
    .map((t): DigestTense => ({
      tense: t.tense,
      label: tenseLabel(t.tense) ?? t.tense,
      status: t.status as DigestTense["status"],
      uses: t.uses,
      accuracy: t.accuracy,
      confusedWith: t.confusedWith[0] ? (tenseLabel(t.confusedWith[0].tense) ?? t.confusedWith[0].tense) : null,
      example: t.confusedWith[0]?.example ?? null,
    }));

  return {
    period: {
      days: input.days,
      from: input.days === null ? null : input.now - input.days * 86_400_000,
      to: input.now,
    },
    totals: {
      messages: stats.totals.messages,
      words: stats.totals.words,
      errors: stats.totals.errors,
      per100Words: stats.totals.per100Words,
      previousPer100Words: stats.totals.previousPer100Words,
      cleanMessagesPct: stats.totals.cleanMessagesPct,
    },
    weakest: areas.filter((a) => a.count > 0).slice(0, MAX_AREAS),
    worsened: areas
      .filter((a) => a.trend !== null && a.trend >= TREND_THRESHOLD)
      .sort((a, b) => b.trend! - a.trend!)
      .slice(0, MAX_AREAS),
    improved: areas
      .filter((a) => a.trend !== null && a.trend <= -TREND_THRESHOLD)
      .sort((a, b) => a.trend! - b.trend!)
      .slice(0, MAX_AREAS),
    tenses,
    unclassifiedTenses: input.tenses.unclassified,
    topMistakes: stats.topMistakes.slice(0, MAX_MISTAKES).map((m) => ({
      label: subtypeLabel(m.category, m.subtype) ?? humanize(m.subcategory),
      category: categoryLabel(m.category),
      count: m.count,
      ...m.example,
    })),
    vocabulary: [...input.vocabulary]
      .sort((a, b) => b.timesLookedUp - a.timesLookedUp || b.lastSeen - a.lastSeen)
      .slice(0, MAX_WORDS)
      .map((w) => ({ spanish: w.spanish, english: w.english[0] ?? "", times: w.timesLookedUp })),
  };
}

/** The digest as plain English text, for the model. */
export function digestToPromptText(d: StatsDigest): string {
  const lines: string[] = [];
  const period = d.period.days === null ? "all time" : `the last ${d.period.days} days`;
  lines.push(`Period: ${period}.`);
  lines.push(
    `Totals: ${d.totals.messages} messages, ${d.totals.words} words, ${d.totals.errors} mistakes ` +
      `(${d.totals.per100Words} per 100 words${
        d.totals.previousPer100Words !== null ? `; previous period: ${d.totals.previousPer100Words}` : ""
      }), ${Math.round(d.totals.cleanMessagesPct)}% of messages without mistakes.`,
  );

  lines.push("", "Weakest areas (weakest first):");
  if (d.weakest.length === 0) lines.push("- none");
  for (const a of d.weakest) lines.push(`- ${areaLine(a)}`);

  if (d.worsened.length > 0) {
    lines.push("", "Areas that got worse vs the previous period:");
    for (const a of d.worsened) lines.push(`- ${a.label}: +${a.trend} mistakes per 100 words`);
  }
  if (d.improved.length > 0) {
    lines.push("", "Areas that improved vs the previous period:");
    for (const a of d.improved) lines.push(`- ${a.label}: ${a.trend} mistakes per 100 words`);
  }

  if (d.tenses.length > 0) {
    lines.push("", "Verb tenses to work on:");
    for (const t of d.tenses) lines.push(`- ${tenseLine(t)}`);
  }

  if (d.topMistakes.length > 0) {
    lines.push("", "Most frequent mistakes (with the latest real example):");
    for (const m of d.topMistakes) {
      lines.push(`- ${m.label} (${m.category}), ${m.count}×: "${m.original}" → "${m.correction}"`);
    }
  }

  if (d.vocabulary.length > 0) {
    lines.push("", "Words the learner didn't know and looked up (Spanish → English):");
    for (const w of d.vocabulary) lines.push(`- ${w.spanish} → ${w.english}${w.times > 1 ? ` (${w.times}×)` : ""}`);
  }
  return lines.join("\n");
}

/**
 * The digest (and optionally a study plan) as Markdown, to paste in a note,
 * send to the teacher before class or share on screen.
 */
export function digestToMarkdown(d: StatsDigest, plan?: MarkdownPlan | null): string {
  const out: string[] = [];
  const period = d.period.days === null ? "All time" : `Last ${d.period.days} days`;
  out.push(
    `# English report — ${period} (${formatDate(d.period.from ?? d.period.to)} – ${formatDate(d.period.to)})`,
    "",
  );
  out.push(
    `${d.totals.messages} messages · ${d.totals.words} words · ${d.totals.errors} mistakes · ` +
      `${d.totals.per100Words} per 100 words` +
      (d.totals.previousPer100Words !== null ? ` (previous period: ${d.totals.previousPer100Words})` : ""),
  );

  if (d.weakest.length > 0) {
    out.push("", "## Areas to work on", "");
    for (const a of d.weakest) out.push(`- ${areaLine(a)}`);
  }
  if (d.worsened.length > 0) {
    out.push("", "## Got worse", "");
    for (const a of d.worsened) out.push(`- ${a.label}: +${a.trend} per 100 words`);
  }
  if (d.improved.length > 0) {
    out.push("", "## Improved", "");
    for (const a of d.improved) out.push(`- ${a.label}: ${a.trend} per 100 words`);
  }
  if (d.tenses.length > 0) {
    out.push("", "## Verb tenses", "");
    for (const t of d.tenses) out.push(`- ${tenseLine(t)}`);
  }
  if (d.topMistakes.length > 0) {
    out.push("", "## Most frequent mistakes", "");
    for (const m of d.topMistakes) {
      out.push(`- **${m.label}** (${m.category}, ${m.count}×): ~~${m.original}~~ → ${m.correction}`);
    }
  }
  if (d.vocabulary.length > 0) {
    out.push("", "## Words I looked up", "");
    for (const w of d.vocabulary) out.push(`- ${w.spanish} → ${w.english}${w.times > 1 ? ` (${w.times}×)` : ""}`);
  }

  if (plan) {
    out.push("", "## Study plan", "", plan.summary);
    plan.focus.forEach((f, i) => {
      out.push("", `### ${i + 1}. ${f.topic}`, "", f.why, "", `- Practice: ${f.practice}`);
      if (f.example) out.push(`- Example: ${f.example}`);
    });
    if (plan.goal) out.push("", `**Goal:** ${plan.goal}`);
  }
  return `${out.join("\n")}\n`;
}

/** The parts of a study plan the Markdown export needs. */
export interface MarkdownPlan {
  summary: string;
  focus: { topic: string; why: string; practice: string; example: string }[];
  goal: string;
}

function areaLine(a: DigestArea): string {
  const trend = a.trend === null ? "" : `, trend ${a.trend > 0 ? "+" : ""}${a.trend}`;
  const types = a.types.length > 0 ? ` — mainly: ${a.types.join(", ")}` : "";
  return `${a.label}: ${a.count} mistakes (${a.per100Words} per 100 words${trend})${types}`;
}

function tenseLine(t: DigestTense): string {
  if (t.status === "avoided") return `${t.label}: almost never used (avoided)`;
  const accuracy = t.accuracy === null ? "" : `, ${t.accuracy}% correct`;
  const confusion = t.confusedWith ? `; often replaced with ${t.confusedWith}` : "";
  return `${t.label}: ${t.status}, ${t.uses} uses${accuracy}${confusion}`;
}

function statusRank(status: string): number {
  return status === "weak" ? 0 : status === "shaky" ? 1 : 2;
}

function humanize(snake: string) {
  const text = snake.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
