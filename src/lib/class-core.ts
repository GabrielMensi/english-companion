/**
 * Pure parts of the class integration (docs/class/CLASS_REPORT.md): the period of the report to take to
 * class, the AI schemas and prompts to structure the teacher's corrections and to suggest what to ask,
 * and the comparison of the teacher's level with the app's estimate. Schemas are small and flat.
 */
import { z } from "zod";
import { CEFR_LEVELS, type CefrLevel, type LevelEstimate } from "@/lib/insights/level-core";
import { digestToMarkdown, type StatsDigest } from "@/lib/insights/digest-core";
import { CATEGORY_HINTS, ERROR_CATEGORIES, SEVERITIES } from "@/lib/taxonomy";
import { wordKey } from "@/lib/vocabulary-core";

const DAY = 86_400_000;

/** Words assumed for each correction the teacher gave when the learner doesn't say how much they spoke. */
export const WORDS_PER_CLASS_CORRECTION = 12;
/** Longest teacher text the structuring call takes. */
export const MAX_CLASS_TEXT = 8000;
export const MAX_CLASS_ITEMS = 60;

// ---------- Report period ----------

export interface ClassMeeting {
  id: string;
  heldAt: number;
  teacherLevel: CefrLevel | null;
}

export interface ReportPeriod {
  from: number;
  to: number;
  /** The class the period starts at, when it's "since the last class". */
  since: ClassMeeting | null;
}

export type PeriodRequest = { sinceId?: string | null; from?: string | null; to?: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Start of a local day for `YYYY-MM-DD`, or null when it isn't a real date. */
export function parseDay(value: string | null | undefined): number | null {
  if (!value || !DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date.getTime() : null;
}

/**
 * The period of the report: picked dates, or since a given class, or (default) since the most recent
 * class that already happened. Without classes it's the last 7 days.
 */
export function resolveReportPeriod(meetings: ClassMeeting[], request: PeriodRequest, now: number): ReportPeriod {
  const from = parseDay(request.from);
  if (from !== null) {
    const day = parseDay(request.to);
    const to = day !== null ? Math.min(day + DAY, now) : now;
    if (to > from) return { from, to, since: null };
  }
  const past = meetings.filter((m) => m.heldAt <= now).sort((a, b) => b.heldAt - a.heldAt);
  const picked = request.sinceId ? meetings.find((m) => m.id === request.sinceId) : undefined;
  const since = picked && picked.heldAt < now ? picked : (past[0] ?? null);
  if (since) return { from: since.heldAt, to: now, since };
  return { from: now - 7 * DAY, to: now, since: null };
}

/** The digest, relabeled with the exact period the report covers. */
export function withPeriod(digest: StatsDigest, period: ReportPeriod): StatsDigest {
  return {
    ...digest,
    period: { days: Math.max(1, Math.ceil((period.to - period.from) / DAY)), from: period.from, to: period.to },
  };
}

// ---------- Teacher's level vs the app's estimate ----------

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === "string" && (CEFR_LEVELS as readonly string[]).includes(value);
}

export interface TeacherComparison {
  /** Levels the app's estimate is above (+) or below (-) the teacher's. */
  difference: number;
  text: string;
}

export function compareWithTeacher(
  estimate: Pick<LevelEstimate, "level">,
  teacher: CefrLevel,
): TeacherComparison | null {
  if (estimate.level === null) return null;
  const difference = CEFR_LEVELS.indexOf(estimate.level) - CEFR_LEVELS.indexOf(teacher);
  if (difference === 0) return { difference, text: "Same level as the app's estimate." };
  const steps = Math.abs(difference) === 1 ? "one level" : `${Math.abs(difference)} levels`;
  return {
    difference,
    text: `The app's estimate is ${steps} ${difference > 0 ? "above" : "below"} the teacher's.`,
  };
}

// ---------- Structuring the teacher's corrections ----------

export const classImportSchema = z.object({
  corrections: z.array(
    z.object({
      original: z.string().describe("What the learner said or wrote, as the teacher quoted it."),
      correction: z.string().describe("What the teacher says it should be."),
      category: z.enum(ERROR_CATEGORIES),
      subcategory: z.string().describe("Specific snake_case label, e.g. present_perfect_vs_past_simple."),
      severity: z.enum(SEVERITIES),
      explanation: z.string().describe("The teacher's reason, or a one-sentence rule."),
    }),
  ),
  words: z.array(
    z.object({
      spanish: z.string().describe("The Spanish meaning of the new word or phrase."),
      english: z.array(z.string()).describe("1 to 3 English options, the teacher's first."),
      note: z.string().nullable().describe("Short usage note, or null."),
    }),
  ),
});

export type ClassImport = z.infer<typeof classImportSchema>;

/** What the browser sends back to save, already reviewed: same shape, with limits. */
export const classItemsSchema = z.object({
  corrections: classImportSchema.shape.corrections.max(MAX_CLASS_ITEMS),
  words: classImportSchema.shape.words.max(MAX_CLASS_ITEMS),
  /** About how many words the learner spoke in class; unknown by default. */
  spokenWords: z.number().int().min(0).max(100_000).nullish(),
});

export function buildClassImportInstructions(language: "es" | "en"): string {
  const categories = ERROR_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join("\n");
  const explain = language === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  return `You structure the notes a learner took of what their English teacher corrected in a class. The learner is a native Spanish speaker. Return a JSON object with "corrections" and "words".

Rules:
1. corrections: one entry per mistake the teacher corrected. "original" is what the learner said, "correction" what it should be. Use only what is in the notes: never invent mistakes, never add corrections of your own. If the notes give only the correct form, reconstruct "original" only when it is clearly implied; otherwise skip the entry.
2. category: exactly one of:
${categories}
   subcategory: a specific snake_case name for the rule (e.g. past_simple_with_finished_time), never equal to the category.
3. severity: suggestion, minor, moderate or major (never typo: these are not keyboard slips). Use moderate when unsure.
4. explanation: in ${explain}, one short sentence: the teacher's reason if the notes give one, otherwise the rule.
5. words: new words or phrases the teacher taught (vocabulary, expressions, phrasal verbs), not corrections. "english" holds the English word as taught; "spanish" its Spanish meaning (translate it if the notes don't). Skip anything that is already a correction entry.
6. Empty arrays when there is nothing of that kind.`;
}

export function buildClassImportPrompt(text: string): string {
  return `Notes from the class:\n<<<\n${text}\n>>>`;
}

/** Cleans up the model output so a bad answer doesn't pollute the stats: same rules as the chat analysis. */
export function normalizeClassImport(raw: ClassImport): ClassImport {
  const seen = new Set<string>();
  const corrections = raw.corrections
    .map((e) => ({
      ...e,
      original: e.original.trim(),
      correction: e.correction.trim(),
      subcategory: toSnakeCase(e.subcategory) || e.category,
      // Spoken-in-class mistakes are never keyboard slips.
      severity: e.severity === "typo" ? ("minor" as const) : e.severity,
      explanation: e.explanation.trim(),
    }))
    .filter((e) => {
      if (!e.original || !e.correction || e.original === e.correction) return false;
      const key = `${e.original.toLowerCase()}→${e.correction.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CLASS_ITEMS);

  const words = new Map<string, ClassImport["words"][number]>();
  for (const w of raw.words) {
    const spanish = w.spanish.trim();
    const english = w.english
      .map((e) => e.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!spanish || english.length === 0) continue;
    const key = wordKey(spanish);
    if (!words.has(key)) words.set(key, { spanish, english, note: w.note?.trim() || null });
  }
  return { corrections, words: [...words.values()].slice(0, MAX_CLASS_ITEMS) };
}

function toSnakeCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The words the learner is assumed to have spoken for the stats' denominator (see docs/class/CLASS_REPORT.md). */
export function classWordCount(correctionCount: number, spokenWords: number | null | undefined): number {
  if (spokenWords && spokenWords > 0) return spokenWords;
  return correctionCount * WORDS_PER_CLASS_CORRECTION;
}

// ---------- What to ask the teacher ----------

export const classQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        ask: z.string().describe("A question or request to say to the teacher, in English, first person."),
        why: z.string().describe("Why it matters, citing the learner's numbers or real mistakes."),
      }),
    )
    .describe("3 to 5 items, most important first."),
});

export type ClassQuestions = z.infer<typeof classQuestionsSchema>;

export const MAX_QUESTIONS = 5;

export function buildClassQuestionsInstructions(language: "es" | "en"): string {
  const explain = language === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  return `You help a native Spanish speaker prepare for their English class. You get the statistics of what they wrote since the last class and suggest what to ask the teacher.

Rules:
- Base everything on the statistics: cite the numbers and real mistakes. Never invent mistakes, numbers or words.
- 3 to 5 items, most important first: repeated mistakes, areas that got worse, and the words they had to look up.
- "ask" is a short question or request the learner can say out loud to the teacher, in English ("Could we practice the difference between ... and ...?", "Can you listen for my ... when I speak?").
- "why" is in ${explain}, one sentence with the evidence.`;
}

export function normalizeClassQuestions(raw: ClassQuestions): ClassQuestions {
  const questions = raw.questions
    .map((q) => ({ ask: q.ask.trim(), why: q.why.trim() }))
    .filter((q) => q.ask)
    .slice(0, MAX_QUESTIONS);
  if (questions.length === 0) throw new Error("The model returned no questions");
  return { questions };
}

/** Identifies the period the stored questions were written for (they go stale when the period changes). */
export function periodKey(period: Pick<ReportPeriod, "from">, errors: number): string {
  return `${Math.floor(period.from / 3_600_000)}:${errors}`;
}

// ---------- Markdown export ----------

export interface ReportTeacher {
  heldAt: number;
  level: CefrLevel;
}

/** The report to take to class as Markdown: the digest plus the teacher's level and what to ask. */
export function classReportToMarkdown(
  digest: StatsDigest,
  extras: {
    since: ClassMeeting | null;
    questions: ClassQuestions | null;
    teacher: ReportTeacher | null;
    appLevel: CefrLevel | null;
  },
): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const title = extras.since
    ? `since the class on ${day(extras.since.heldAt)}`
    : `${day(digest.period.from ?? digest.period.to)} – ${day(digest.period.to)}`;
  const parts = [digestToMarkdown(digest, null, { title: `English report to take to class — ${title}` }).trimEnd()];
  if (extras.appLevel || extras.teacher) {
    const lines = ["## Level"];
    if (extras.appLevel) lines.push("", `- App's estimate (from my writing): ${extras.appLevel}`);
    if (extras.teacher) lines.push(`- Teacher's level on ${day(extras.teacher.heldAt)}: ${extras.teacher.level}`);
    parts.push(lines.join("\n"));
  }
  if (extras.questions) {
    parts.push(
      ["## What to ask the teacher", "", ...extras.questions.questions.map((q) => `- ${q.ask} _(${q.why})_`)].join(
        "\n",
      ),
    );
  }
  return `${parts.join("\n\n")}\n`;
}
