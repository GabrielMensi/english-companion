/**
 * Pure parts of the message analysis: output schema, prompt building and
 * normalization. Kept free of server-only imports so it can be unit tested.
 */
import type { DeepPartial } from "ai";
import { z } from "@/lib/zod";
import type { InputMode, SessionMode } from "@/db/schema";
import { CATEGORY_HINTS, ERROR_CATEGORIES, SEVERITIES, TRANSCRIBER_CATEGORIES } from "@/lib/taxonomy";

export const analysisSchema = z.object({
  correctedText: z.string().describe("The learner's message with the minimum edits needed to make it correct."),
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
  /** Null for a question the tutor opened the chat with. */
  learner: string | null;
  assistant: string | null;
}

export interface AnalysisPromptInput {
  text: string;
  mode: SessionMode;
  explanationLanguage: "es" | "en";
  history: HistoryTurn[];
  /** Dictated messages come from speech-to-text; defaults to typed. */
  inputMode?: InputMode;
  /** Extra reply rule for tense practice conversations (see src/lib/tense-practice.ts). */
  practiceRule?: string;
}

export function buildAnalysisInstructions(
  input: Pick<AnalysisPromptInput, "mode" | "explanationLanguage" | "inputMode" | "practiceRule">,
) {
  const language = input.explanationLanguage === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
  const categories = ERROR_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join("\n");

  const replyRule =
    input.mode === "conversation"
      ? `8. reply: answer the learner's message in English as a friendly conversation partner, continuing the conversation. Keep it short (2-5 sentences), use B1-B2 level vocabulary and ask a follow-up question when natural. Do NOT mention the corrections in the reply.${input.practiceRule ? `\n   ${input.practiceRule}` : ""}`
      : `8. reply: always null.`;

  return `You are an English writing tutor for a native Spanish speaker. You analyze ONE message the learner wrote in English and return a JSON object.

Rules:
1. correctedText: apply the MINIMUM edits needed to make the message grammatically correct and clear. Preserve meaning, tone, line breaks and markdown. Never change code, code blocks, text inside backticks, identifiers, file paths, URLs or commands. If the message is already correct, return it unchanged.
2. naturalText: how a fluent native speaker would phrase the whole message. Return null if it would be the same or almost the same as correctedText. General stylistic improvements go here, not in errors.
3. errors: one entry per mistake, in order of appearance.
   - original: the exact fragment copied from the learner's message, character by character (a few words, enough to locate it).
   - correction: the corrected fragment.
   - Report EACH mistake as its own entry. Never merge several mistakes into one entry: a typo inside a phrase with a grammar mistake is two entries.
   - The learner writes informal chat messages and prompts for AI tools: judge them as informal writing, not as a formal essay.
   - Only report real mistakes. Do not report the same mistake twice. If there are no mistakes, return an empty array.
4. category: exactly one of:
${categories}
   subcategory: a specific snake_case name for the rule that was broken, more specific than the category and never equal to it (e.g. past_simple_with_finished_time, missing_subject_pronoun, depend_on, need_someone_to_do, keyboard_typo).
5. severity:
   - suggestion: an optional improvement to something that is NOT wrong. These are never mistakes: contractions vs full forms ("is not" and "isn't" are both correct), optional punctuation (a colon, semicolon or dash instead of a comma, optional commas, a missing final period), comma splices in informal text, and correct but less natural wording. Use suggestion sparingly, only when it teaches something useful; general rephrasing belongs in naturalText.
   - typo: an accidental keyboard slip in a word the learner clearly knows: swapped, missing or doubled letters ("teh", "freinds", "wiht", "lenght", "becuase", "apy key"). Use category spelling and subcategory keyboard_typo. Typos are not a learning signal and are never major.
   - A misspelling that resembles the Spanish word ("proyect" for project, "sistem" for system, "adress", "recomend") is NOT a typo: use severity minor with subcategory spanish_influenced_spelling.
   - minor: a small mistake that doesn't affect understanding (missing article, wrong capitalization of "I" or proper nouns, Spanish-influenced spelling).
   - moderate: a clear grammar or vocabulary mistake a reader would notice, but the meaning is still clear.
   - major: the meaning changes or becomes unclear, or it's a fundamental pattern error (false friends, a tense that changes the meaning, Spanish calques that make the sentence confusing).
6. explanation: in ${language}. One or two short sentences explaining the rule, not just restating the fix.
7. spanishPhrases: one entry for EACH text the learner wrote between [square brackets], and nothing else. Brackets mean the learner didn't know how to say it in English. For each one, give 1-3 English options and an optional short usage note in ${language}, and use the best option in correctedText and naturalText. These are NOT errors. Never add words that are not between brackets, even if they are misspelled or look Spanish. If there are no brackets, return an empty array.
${replyRule}

${
  input.inputMode === "spoken"
    ? `The learner DICTATED this message and speech-to-text wrote it down, so the learner didn't choose its spelling, punctuation or capitalization: never report mistakes in the spelling, punctuation or capitalization categories, and there are no typos. Everything else (grammar, tenses, word choice, word order) is what the learner said: report it as usual.`
    : `The learner's message may contain typos: always infer the intended meaning, never ask for clarification.`
}

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
      .map((t) =>
        [t.learner !== null && `Learner: ${t.learner}`, t.assistant && `You: ${t.assistant}`]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");
    parts.push(`Conversation so far (context only, do not analyze it):\n${history}`);
  }
  parts.push(`Learner's new message to analyze:\n<<<\n${input.text}\n>>>`);
  return parts.join("\n\n");
}

/** Cleans up common model mistakes so bad output doesn't pollute the stats. */
export function normalizeAnalysis(
  raw: Analysis,
  mode: SessionMode,
  originalText: string,
  inputMode: InputMode = "typed",
): Analysis {
  const correctedText = raw.correctedText.trim() || originalText;
  const errors = normalizeErrors(raw.errors, originalText, inputMode);

  const naturalText = raw.naturalText?.trim() || null;

  return {
    correctedText,
    naturalText: naturalText && !sameText(naturalText, correctedText) ? naturalText : null,
    errors,
    spanishPhrases: raw.spanishPhrases
      .map((p) => ({
        spanish: p.spanish.replace(/^\[|\]$/g, "").trim(),
        english: p.english
          .map((e) => e.trim())
          .filter(Boolean)
          .slice(0, 3),
        note: p.note?.trim() || null,
      }))
      // Only what the learner explicitly asked for, between [brackets]. Models also
      // "translate" misspelled English words, which would pollute the vocabulary.
      .filter((p) => p.spanish && p.english.length > 0 && overlapsLookup(originalText, p.spanish)),
    reply: mode === "conversation" ? raw.reply?.trim() || null : null,
  };
}

type AnalysisError = Analysis["errors"][number];

/** Text the learner wrote between [brackets] (a vocabulary lookup), as padded normalized words. */
function lookupsOf(originalText: string): string[] {
  return [...originalText.matchAll(/\[([^\]]+)\]/g)].map((m) => ` ${normalizeWords(m[1])} `);
}

// Whole words only: a short fragment like "a" must not match inside "[aprovechar]".
function overlapsLookup(originalText: string, fragment: string): boolean {
  const lookups = lookupsOf(originalText);
  const words = ` ${normalizeWords(fragment.replace(/[[\]]/g, " "))} `;
  return words.trim().length > 0 && lookups.some((l) => l.includes(words) || words.includes(l));
}

/** Cleans up the reported mistakes: shared by the final result and the streamed preview. */
function normalizeErrors(raw: AnalysisError[], originalText: string, inputMode: InputMode): AnalysisError[] {
  const clean = (s: string) => s.trim();
  // Text the learner wrote between [brackets] is a vocabulary lookup, never a mistake.
  const lookups = lookupsOf(originalText);
  const isLookupError = (fragment: string) =>
    fragment.includes("[") || lookups.includes(` ${normalizeWords(fragment)} `);

  const seen = new Set<string>();
  return raw
    .map((e) => ({
      ...e,
      // Models often flag contractions or optional punctuation as mistakes.
      severity:
        e.severity !== "typo" && isOptionalChange(e.original, e.correction) ? ("suggestion" as const) : e.severity,
      original: clean(e.original),
      correction: clean(e.correction),
      subcategory: toSnakeCase(e.subcategory) || e.category,
      explanation: clean(e.explanation),
    }))
    .filter((e) => {
      // In dictated messages, spelling, punctuation and capitalization are the transcriber's.
      if (inputMode === "spoken" && (e.severity === "typo" || TRANSCRIBER_CATEGORIES.includes(e.category)))
        return false;
      // Models sometimes report "errors" where nothing changes...
      if (e.original === e.correction) return false;
      // ...or copy them from the prompt's example instead of the learner's text.
      if (!containsLoosely(originalText, e.original)) return false;
      if (isLookupError(e.original)) return false;
      const key = `${e.original.toLowerCase()}→${e.correction.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** What the model has written so far while the analysis streams. */
export type PartialAnalysis = DeepPartial<Analysis>;

/** A partial analysis cleaned up for display. Only shown while streaming: the saved result comes from {@link normalizeAnalysis}. */
export interface AnalysisPreview {
  /** Null until the model starts writing it. */
  correctedText: string | null;
  /** True once the model moved past correctedText, so it's safe to diff it against the original. */
  correctedDone: boolean;
  naturalText: string | null;
  /** Mistakes whose fragment, correction, category and severity are complete; the explanation may still be growing. */
  errors: Omit<AnalysisError, "subcategory">[];
  reply: string | null;
}

/**
 * Turns a partial analysis into something safe to show. Strings may be cut mid-word and the last
 * array element may be incomplete, so a mistake only shows once its explanation has started (the
 * fields before it are then complete) and it passes the same filters as the final result.
 */
export function previewAnalysis(
  partial: PartialAnalysis | undefined,
  mode: SessionMode,
  originalText: string,
  inputMode: InputMode = "typed",
): AnalysisPreview {
  const p = partial ?? {};
  const complete = (p.errors ?? []).filter(
    (e): e is AnalysisError =>
      !!e &&
      typeof e.original === "string" &&
      typeof e.correction === "string" &&
      ERROR_CATEGORIES.includes(e.category as AnalysisError["category"]) &&
      SEVERITIES.includes(e.severity as AnalysisError["severity"]) &&
      typeof e.explanation === "string",
  );
  const errors = normalizeErrors(
    complete.map((e) => ({ ...e, subcategory: e.subcategory ?? "" })),
    originalText,
    inputMode,
  ).map(({ original, correction, category, severity, explanation }) => ({
    original,
    correction,
    category,
    severity,
    explanation,
  }));

  return {
    correctedText: typeof p.correctedText === "string" ? p.correctedText : null,
    correctedDone:
      p.naturalText !== undefined || p.errors !== undefined || p.spanishPhrases !== undefined || p.reply !== undefined,
    naturalText: p.naturalText?.trim() || null,
    errors,
    reply: mode === "conversation" ? p.reply?.trim() || null : null,
  };
}

// Contractions that can be expanded unambiguously. "'s" only after pronouns and
// similar words, because after nouns it's usually a possessive.
const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bshan't\b/g, "shall not"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/\bi'm\b/g, "i am"],
  [/\b(it|he|she|that|there|here|what|where|who|how|let)'s\b/g, "$1 is"],
];

function expandContractions(text: string): string {
  let result = text.toLowerCase().replace(/[’‘]/g, "'");
  for (const [pattern, replacement] of CONTRACTIONS) result = result.replace(pattern, replacement);
  return result;
}

/**
 * True when a "correction" only swaps a contraction for its full form (or the
 * other way around) or changes optional punctuation (, ; : . — –). Those are
 * suggestions, not mistakes. Apostrophes, question marks and letter changes
 * are not optional ("its" → "it's" is still a mistake).
 */
export function isOptionalChange(original: string, correction: string): boolean {
  const canonical = (text: string) =>
    expandContractions(text)
      .replace(/[,;:.—–]+|\s-\s/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return original.trim() !== correction.trim() && canonical(original) === canonical(correction);
}

/** Lowercase words without accents or punctuation, separated by single spaces. */
function normalizeWords(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
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
