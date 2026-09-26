/**
 * Pure parts of the message analysis: output schema, prompt building and
 * normalization. Kept free of server-only imports so it can be unit tested.
 */
import { z } from "zod";
import type { SessionMode } from "@/db/schema";
import { CATEGORY_HINTS, ERROR_CATEGORIES, SEVERITIES } from "@/lib/taxonomy";

export const analysisSchema = z.object({
  correctedText: z
    .string()
    .describe("The learner's message with the minimum edits needed to make it correct."),
  naturalText: z
    .string()
    .nullable()
    .describe("How a fluent native speaker would phrase it, or null if the corrected text is already natural."),
  errors: z.array(
    z.object({
      original: z.string().describe("Exact fragment copied from the learner's message."),
      correction: z.string().describe("What that fragment should be."),
      category: z.enum(ERROR_CATEGORIES),
      subcategory: z.string().describe("Specific snake_case label, e.g. present_perfect_vs_past_simple."),
      severity: z.enum(SEVERITIES),
      explanation: z.string(),
    }),
  ),
  spanishPhrases: z.array(
    z.object({
      spanish: z.string(),
      english: z.array(z.string()).describe("1 to 3 English options, best first."),
      note: z.string().nullable(),
    }),
  ),
  reply: z.string().nullable().describe("Conversational reply, or null in correction mode."),
});

export type Analysis = z.infer<typeof analysisSchema>;

export interface HistoryTurn {
  learner: string;
  assistant: string | null;
}

export interface AnalysisPromptInput {
  text: string;
  mode: SessionMode;
  explanationLanguage: "es" | "en";
  history: HistoryTurn[];
}

export function buildAnalysisInstructions(input: Pick<AnalysisPromptInput, "mode" | "explanationLanguage">) {
  const language = input.explanationLanguage === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  const categories = ERROR_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join("\n");

  const replyRule =
    input.mode === "conversation"
      ? `8. reply: answer the learner's message in English as a friendly conversation partner, continuing the conversation. Keep it short (2-5 sentences), use B1-B2 level vocabulary and ask a follow-up question when natural. Do NOT mention the corrections in the reply.`
      : `8. reply: always null.`;

  return `You are an English writing tutor for a native Spanish speaker. You analyze ONE message the learner wrote in English and return a JSON object.

Rules:
1. correctedText: apply the MINIMUM edits needed to make the message grammatically correct and clear. Preserve meaning, tone, line breaks and markdown. Never change code, code blocks, text inside backticks, identifiers, file paths, URLs or commands. If the message is already correct, return it unchanged.
2. naturalText: how a fluent native speaker would phrase the whole message. Return null if it would be the same or almost the same as correctedText. Stylistic improvements go here, NOT in errors.
3. errors: one entry per mistake, in order of appearance.
   - original: the exact fragment copied from the learner's message, character by character (a few words, enough to locate it).
   - correction: the corrected fragment.
   - Report EACH mistake as its own entry. Never merge several mistakes into one entry: a typo inside a phrase with a grammar mistake is two entries.
   - Only report real mistakes, never stylistic preferences (those go in naturalText). Do not report the same mistake twice.
   - If there are no mistakes, return an empty array.
4. category: exactly one of:
${categories}
   subcategory: a specific snake_case name for the rule that was broken, more specific than the category and never equal to it (e.g. past_simple_with_finished_time, missing_subject_pronoun, depend_on, need_someone_to_do, keyboard_typo).
5. severity:
   - typo: an accidental keyboard slip in a word the learner clearly knows: swapped, missing or doubled letters ("teh", "freinds", "wiht", "lenght", "becuase"). Use category spelling and subcategory keyboard_typo. Typos are not a learning signal.
   - A misspelling that resembles the Spanish word ("proyect" for project, "sistem" for system, "adress", "recomend") is NOT a typo: use severity minor with subcategory spanish_influenced_spelling.
   - minor: a small mistake that doesn't affect understanding (missing article, punctuation, capitalization, Spanish-influenced spelling).
   - moderate: a clear grammar or vocabulary mistake a reader would notice, but the meaning is still clear.
   - major: the meaning changes or becomes unclear, or it's a fundamental pattern error (false friends, a tense that changes the meaning, Spanish calques that make the sentence confusing).
6. explanation: in ${language}. One or two short sentences explaining the rule, not just restating the fix.
7. spanishPhrases: ONLY for Spanish words that actually appear in the learner's message, usually between [square brackets] because the learner didn't know how to say them. For each one, give 1-3 English options and an optional short usage note in ${language}, and use the best option in correctedText and naturalText. These are NOT errors. Never include English words, misspelled English words or typos here. If the message has no Spanish, return an empty array.
${replyRule}

The learner's message may contain typos: always infer the intended meaning, never ask for clarification.

Example. For the message "Yesterday I have went to teh store for buy milk" the errors are:
[
  {"original": "I have went", "correction": "I went", "category": "verb_tense", "subcategory": "past_simple_with_finished_time", "severity": "moderate", "explanation": "..."},
  {"original": "teh", "correction": "the", "category": "spelling", "subcategory": "keyboard_typo", "severity": "typo", "explanation": "..."},
  {"original": "for buy", "correction": "to buy", "category": "gerund_infinitive", "subcategory": "infinitive_of_purpose", "severity": "moderate", "explanation": "..."}
]`;
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const parts: string[] = [];
  if (input.mode === "conversation" && input.history.length > 0) {
    const history = input.history
      .map((t) => `Learner: ${t.learner}${t.assistant ? `\nYou: ${t.assistant}` : ""}`)
      .join("\n\n");
    parts.push(`Conversation so far (context only, do not analyze it):\n${history}`);
  }
  parts.push(`Learner's new message to analyze:\n<<<\n${input.text}\n>>>`);
  return parts.join("\n\n");
}

/** Cleans up common model mistakes so bad output doesn't pollute the stats. */
export function normalizeAnalysis(raw: Analysis, mode: SessionMode, originalText: string): Analysis {
  const clean = (s: string) => s.trim();
  const correctedText = raw.correctedText.trim() || originalText;

  const seen = new Set<string>();
  const errors = raw.errors
    .map((e) => ({
      ...e,
      original: clean(e.original),
      correction: clean(e.correction),
      subcategory: toSnakeCase(e.subcategory) || e.category,
      explanation: clean(e.explanation),
    }))
    .filter((e) => {
      // Models sometimes report "errors" where nothing changes...
      if (e.original === e.correction) return false;
      // ...or copy them from the prompt's example instead of the learner's text.
      if (!containsLoosely(originalText, e.original)) return false;
      const key = `${e.original.toLowerCase()}→${e.correction.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const naturalText = raw.naturalText?.trim() || null;
  const errorFragments = new Set(errors.map((e) => e.original.toLowerCase()));

  return {
    correctedText,
    naturalText: naturalText && !sameText(naturalText, correctedText) ? naturalText : null,
    errors,
    spanishPhrases: raw.spanishPhrases
      .map((p) => ({
        spanish: p.spanish.replace(/^\[|\]$/g, "").trim(),
        english: p.english.map(clean).filter(Boolean).slice(0, 3),
        note: p.note?.trim() || null,
      }))
      // Drop phrases the model made up: they must appear in what the learner wrote.
      .filter(
        (p) =>
          p.spanish &&
          p.english.length > 0 &&
          containsLoosely(originalText, p.spanish) &&
          // A misspelled English word already reported as an error isn't Spanish.
          !errorFragments.has(p.spanish.toLowerCase()),
      ),
    reply: mode === "conversation" ? raw.reply?.trim() || null : null,
  };
}

/** Case-, accent-, whitespace- and edge-punctuation-insensitive substring check. */
export function containsLoosely(text: string, fragment: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const needle = norm(fragment).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return needle.length > 0 && norm(text).includes(needle);
}

function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

export function toSnakeCase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
