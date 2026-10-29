/**
 * Prompts, output schemas and normalization for the AI parts of the insights
 * page: the weekly study plan and the (optional) explanation of the level
 * estimate. Pure, so it's tested; the calls live in `src/lib/ai/insights.ts`.
 * Schemas are small and flat: every provider fills them reliably, Groq's structured output included.
 */
import { z } from "@/lib/zod";
import { type StatsDigest, digestToPromptText } from "./digest-core";
import type { LevelEstimate, LevelWindow } from "./level-core";

export type ExplanationLanguage = "es" | "en";

function languageName(language: ExplanationLanguage) {
  return language === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
}

// ---------- Weekly study plan ----------

export const studyPlanSchema = z.object({
  summary: z.string().describe("2-3 sentences: how the period went and the main thing to focus on."),
  focus: z
    .array(
      z.object({
        topic: z.string().describe("Short name of the topic to practice."),
        why: z.string().describe("Why, citing the learner's numbers or real mistakes."),
        practice: z.string().describe("A concrete exercise to do this week, with how many / how often."),
        example: z.string().describe("A short English example sentence that uses the topic correctly."),
      }),
    )
    .describe("2 to 4 topics, most important first."),
  goal: z.string().describe("One measurable goal for next week."),
});

export type RawStudyPlan = z.infer<typeof studyPlanSchema>;
export type StudyPlan = RawStudyPlan;

export const MAX_FOCUS = 4;

export function buildPlanInstructions(language: ExplanationLanguage): string {
  return `You are an English teacher for a native Spanish speaker who practices by writing chat messages and prompts for AI tools. You get the statistics of their recent writing and write a short, concrete study plan for the next week.

Rules:
- Base everything on the statistics you get: cite the numbers and the real mistakes. Never invent mistakes, numbers or words.
- Pick 2 to 4 topics, most important first: the weakest areas, the ones that got worse, weak or avoided tenses and repeated mistakes. Group related mistakes into one topic.
- Spelling or punctuation topics only if they are clearly among the top problems.
- If there's a pronunciation section (read-aloud practice), a pronunciation topic is fine when a sound is clearly a problem; its practice is reading sentences with that sound aloud.
- Each "practice" is a concrete exercise the learner can do in 10-15 minutes a day without a textbook (e.g. "write 5 sentences about last weekend using the past simple", "rewrite these 3 sentences", "in the chat, use 'depend on' twice a day").
- "example" is a correct English sentence, short and natural, related to the learner's real mistakes when possible.
- "goal" is measurable with the app's stats (e.g. "fewer than 1 preposition mistake per 100 words").
- Write summary, topic, why, practice and goal in ${languageName(language)}. Keep English words, examples and quoted mistakes in English.
- Be brief and encouraging, without filler.`;
}

export function buildPlanPrompt(digest: StatsDigest): string {
  return `Statistics:\n<<<\n${digestToPromptText(digest)}\n>>>`;
}

export function normalizePlan(raw: RawStudyPlan): StudyPlan {
  const focus = raw.focus
    .map((f) => ({
      topic: f.topic.trim(),
      why: f.why.trim(),
      practice: f.practice.trim(),
      example: f.example.trim(),
    }))
    .filter((f) => f.topic && f.practice)
    .slice(0, MAX_FOCUS);
  if (focus.length === 0) throw new Error("The model returned an empty plan");
  return { summary: raw.summary.trim(), focus, goal: raw.goal.trim() };
}

// ---------- Level explanation ----------

export const levelExplanationSchema = z.object({
  explanation: z.string().describe("3-5 sentences: what the estimate means and which signals pull it up or down."),
  nextSteps: z.array(z.string()).describe("2 or 3 concrete things to do to reach the next level."),
});

export type LevelExplanation = z.infer<typeof levelExplanationSchema>;

export function buildLevelInstructions(language: ExplanationLanguage): string {
  return `You are an English teacher for a native Spanish speaker. The app estimated the learner's CEFR level with fixed rules from their writing. You explain that estimate; you do NOT change it.

Rules:
- Use the level, range and signals you get. Never give a different level.
- Say clearly that it's a rough estimate from their writing only (not reading, listening or speaking) and not an official test.
- Explain which signals pull the estimate up and which pull it down, with their numbers.
- nextSteps: 2 or 3 concrete, practical actions aimed at the weakest signals and the next level.
- Write in ${languageName(language)}. Keep English examples in English.
- Be brief and encouraging.`;
}

export function buildLevelPrompt(estimate: LevelEstimate, evolution: LevelWindow[]): string {
  if (estimate.level === null) throw new Error("There's no estimate to explain yet");
  const lines = [
    `Estimated level: ${estimate.level} (score ${estimate.score} on a 1-6 scale where 1 = A1 and 6 = C2; ${estimate.position} in the band).`,
    `Plausible range: ${estimate.range!.from}-${estimate.range!.to}. Confidence: ${estimate.confidence}, from ${estimate.words} words in ${estimate.messages} messages.`,
    "",
    "Signals:",
    ...estimate.signals.map(
      (s) =>
        `- ${s.label} (${s.weight > 0 ? `weight ${Math.round(s.weight * 100)}%` : "context only, not scored"}): ${s.value} → ${s.level} (score ${s.score}). ${s.basis}`,
    ),
  ];
  if (estimate.lookupsPer1000Words !== null) {
    lines.push(
      `- Words looked up in Spanish: ${estimate.lookupsPer1000Words} per 1,000 words (context only, not scored).`,
    );
  }
  if (evolution.length > 1) {
    lines.push("", "Evolution (oldest first):");
    for (const w of evolution) lines.push(`- ${w.words} words: ${w.per100Words} mistakes per 100 words → ${w.level}`);
  }
  return lines.join("\n");
}

export function normalizeLevelExplanation(raw: LevelExplanation): LevelExplanation {
  const explanation = raw.explanation.trim();
  if (!explanation) throw new Error("The model returned an empty explanation");
  return {
    explanation,
    nextSteps: raw.nextSteps
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

/** Whether a stored AI text still matches the current estimate (same level and roughly the same data). */
export function isExplanationCurrent(
  stored: { level: string; words: number } | null,
  estimate: Pick<LevelEstimate, "level" | "words">,
): boolean {
  if (!stored || estimate.level === null) return false;
  return stored.level === estimate.level && Math.abs(stored.words - estimate.words) < 200;
}
