/**
 * Prompts, schemas and normalization for the two AI helpers of topic chats: the end-of-conversation
 * feedback and the phrases worth saving to the Vocabulary page. Pure, so it's tested; the calls live
 * in `src/lib/ai/topic-review.ts`.
 *
 * The model only gets real data (the learner's messages, their stored corrections and the tutor's
 * replies) and everything it quotes is checked against that data afterwards: whatever it makes up
 * is dropped instead of shown (the #71 manual test caught Groq inventing a detail).
 * Schemas are small and flat so every provider fills them reliably, Groq's structured output included.
 */
import { z } from "@/lib/zod";
import { categoryLabel } from "@/lib/taxonomy";

export type ExplanationLanguage = "es" | "en";

/** One learner message of the chat with what the app stored about it. */
export interface ReviewTurn {
  /** What the tutor asked before this message, if anything (shortened). */
  question: string | null;
  text: string;
  /** Dictated: speech-to-text decided its spelling, punctuation and capitalization. */
  spoken: boolean;
  /** The native-sounding version, when the analysis produced one. */
  natural: string | null;
  /** The mistakes that count in the stats, as found by the correction. */
  mistakes: { id: string; original: string; correction: string; category: string }[];
}

/** Thrown for problems the learner can fix (not a topic chat, too little to review): a 400, not a server error. */
export class TopicToolError extends Error {}

/** Most recent learner messages sent to the model: enough for a long interview, short enough for any model. */
export const MAX_REVIEW_TURNS = 30;
/** Fewest learner messages worth reviewing. */
export const MIN_REVIEW_TURNS = 2;

const MAX_FIELD = 600;

function clip(text: string, max = MAX_FIELD): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Text to compare quotes: lowercase, no quotes or ending punctuation, single spaces. */
export function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"‘’]/g, "'")
    .replace(/[…]|\.{3}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s'.,;:!?-]+|[\s'.,;:!?-]+$/g, "");
}

/** Whether `quote` appears in one of `sources` (ignoring case and the model's quotation habits). */
export function isGrounded(quote: string, sources: readonly string[]): boolean {
  const q = normalizeQuote(quote);
  return q.length >= 3 && sources.some((s) => normalizeQuote(s).includes(q));
}

/** Keeps the end of the text: a tutor reply ends with the question the learner answered. */
function clipStart(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
}

/** Whether `phrase` appears in `text` as whole words (ignoring case and quotation habits). */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = normalizeQuote(phrase);
  return p.length >= 3 && ` ${normalizeQuote(text)} `.includes(` ${p} `);
}

function languageName(language: ExplanationLanguage) {
  return language === "es" ? "Spanish (Rioplatense, neutral tone)" : "English";
}

// ---------- Feedback ----------

export const feedbackSchema = z.object({
  overall: z.string().describe("1-2 sentences: how the conversation went, in general terms."),
  strengths: z.array(z.string()).describe("2 or 3 things the learner did well, each tied to something they wrote."),
  recurringMistakes: z
    .array(
      z.object({
        pattern: z.string().describe("The kind of mistake that came back, in a few words."),
        mistakeId: z.string().describe("The id (like m3) of one of the listed mistakes that shows it."),
      }),
    )
    .describe("Up to 3 kinds of mistakes that happened more than once, most important first."),
  betterAnswers: z
    .array(
      z.object({
        answer: z.string().describe("A sentence copied exactly from one of the learner's messages."),
        better: z.string().describe("A clearer or more natural version of that answer."),
      }),
    )
    .describe("Up to 3 answers that could be stronger."),
});

export type RawFeedback = z.infer<typeof feedbackSchema>;
/** The review as shown and stored: each recurring mistake carries the learner's own words from the stored mistake. */
export type TopicFeedback = Omit<RawFeedback, "recurringMistakes"> & {
  recurringMistakes: { pattern: string; example: string }[];
};

export const MAX_STRENGTHS = 3;
export const MAX_RECURRING = 3;
export const MAX_BETTER = 3;

export function buildFeedbackInstructions(topic: string, language: ExplanationLanguage): string {
  return `You are an English teacher for a native Spanish speaker. The learner just had a practice conversation about "${topic}" with an AI tutor. You get their messages (numbered), the tutor question each one answered, and the mistakes the app already found in them. Write a short end-of-conversation review.

Rules:
- Use ONLY what is in the conversation. Never invent answers, facts, experience, companies, numbers or mistakes the learner did not write. If something is not in the data, do not mention it.
- "answer" must be copied exactly (word for word) from the learner's messages; it is checked and discarded if it is not there.
- "recurringMistakes": only kinds of mistakes that appear at least twice in the listed mistakes (same category); "mistakeId" must be one of the ids in the list. If none repeat, return an empty list.
- Never write a name, number, company, technology, place or fact that is not in the conversation, in any field (also not in "better"): the review is checked and sentences that add new ones are discarded.
- Messages marked "(dictated)" come from speech-to-text: never comment on their spelling, punctuation or capitalization.
- "betterAnswers": pick answers that were correct but weak (vague, too short, hard to follow, or unnatural for the situation) and write a stronger version that keeps the learner's own facts and adds nothing new. Keep each one short.
- "strengths": concrete and tied to what they wrote (clear structure, good vocabulary, correct tenses). No generic praise.
- Write overall, strengths and pattern in ${languageName(language)}. Keep quotes and "better" in English.
- Be brief and encouraging, without filler.`;
}

export function buildFeedbackPrompt(topic: string, turns: readonly ReviewTurn[]): string {
  const lines = turns.map((turn, i) => {
    const parts = [`Message ${i + 1}`];
    if (turn.question) parts.push(`Tutor asked: ${clipStart(turn.question, 300)}`);
    parts.push(`${turn.spoken ? "Learner said (dictated)" : "Learner wrote"}: ${clip(turn.text)}`);
    if (turn.natural) parts.push(`Native version: ${clip(turn.natural)}`);
    if (turn.mistakes.length > 0) {
      parts.push(
        `Mistakes found: ${turn.mistakes
          .map(
            (m) =>
              `[${m.id}] "${clip(m.original, 120)}" -> "${clip(m.correction, 120)}" (${categoryLabel(m.category)})`,
          )
          .join("; ")}`,
      );
    }
    return parts.join("\n");
  });
  return `Topic: ${topic}\n\nConversation:\n<<<\n${lines.join("\n\n")}\n>>>`;
}

/** Words that can open a sentence or name something, left out of the "new name" check. */
const NAME_TOKEN = /[\p{L}\d][\p{L}\d'’-]*/gu;

/**
 * Numbers and capitalized names (not at the start of a sentence, not "I") that `text` adds on top of `sources`.
 * Catches the typical invention: a company, a technology or a figure the learner never mentioned.
 */
export function introducedDetails(text: string, sources: readonly string[]): string[] {
  const known = ` ${normalizeQuote(sources.join(" ")).replace(/[^\p{L}\d' -]/gu, " ")} `;
  const added: string[] = [];
  for (const match of text.matchAll(NAME_TOKEN)) {
    const token = match[0].replace(/['’-]+$/, "");
    const before = text.slice(0, match.index).replace(/["“”'‘’(\s]+$/, "");
    const sentenceStart = before === "" || /[.!?:]$/.test(before);
    const isNumber = /\d/.test(token);
    const isName = /^\p{Lu}/u.test(token) && !sentenceStart && token !== "I" && !/^I['’]/.test(token);
    if (!isNumber && !isName) continue;
    if (!known.includes(` ${normalizeQuote(token)} `) && !known.includes(` ${normalizeQuote(token)}s `))
      added.push(token);
  }
  return added;
}

/** The sentences of `text` that don't add details missing from `sources`. */
function withoutInventedDetails(text: string, sources: readonly string[]): string {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [];
  return sentences
    .filter((sentence) => introducedDetails(sentence, sources).length === 0)
    .join("")
    .trim();
}

/**
 * Trims the model's feedback and drops what isn't backed by the conversation: recurring mistakes must be
 * stored mistakes (of a category that happened at least twice), quotes must be in the learner's messages, and
 * sentences with a name or number the learner never wrote are removed.
 */
export function normalizeFeedback(raw: RawFeedback, turns: readonly ReviewTurn[]): TopicFeedback {
  const learner = turns.map((t) => t.text);
  const sources = [...learner, ...turns.flatMap((t) => [t.question ?? "", t.natural ?? ""])];
  const mistakes = new Map(turns.flatMap((t) => t.mistakes.map((m) => [m.id, m] as const)));
  const perCategory = new Map<string, number>();
  for (const m of mistakes.values()) perCategory.set(m.category, (perCategory.get(m.category) ?? 0) + 1);

  const seenCategories = new Set<string>();
  const recurringMistakes = raw.recurringMistakes.flatMap((r) => {
    const mistake = mistakes.get(r.mistakeId.trim().replace(/^\[|\]$/g, ""));
    const pattern = withoutInventedDetails(r.pattern.trim(), sources);
    if (!mistake || !pattern || (perCategory.get(mistake.category) ?? 0) < 2 || seenCategories.has(mistake.category)) {
      return [];
    }
    seenCategories.add(mistake.category);
    return [{ pattern, example: mistake.original }];
  });

  const feedback: TopicFeedback = {
    overall: withoutInventedDetails(raw.overall.trim(), sources),
    strengths: raw.strengths
      .map((s) => withoutInventedDetails(s.trim(), sources))
      .filter(Boolean)
      .slice(0, MAX_STRENGTHS),
    recurringMistakes: recurringMistakes.slice(0, MAX_RECURRING),
    betterAnswers: raw.betterAnswers
      .map((b) => ({ answer: b.answer.trim(), better: b.better.trim() }))
      .filter((b) => b.better && isGrounded(b.answer, learner) && introducedDetails(b.better, sources).length === 0)
      .slice(0, MAX_BETTER),
  };
  if (!feedback.overall && feedback.strengths.length === 0 && feedback.betterAnswers.length === 0) {
    throw new Error("The model returned an empty review");
  }
  return feedback;
}

// ---------- Phrases for the Vocabulary page ----------

export const phrasesSchema = z.object({
  phrases: z
    .array(
      z.object({
        phrase: z.string().describe("The English word or phrase, copied exactly from the conversation."),
        spanish: z.string().describe("A short Spanish translation or meaning."),
      }),
    )
    .describe("Up to 8 useful words or phrases."),
});

export type RawPhrases = z.infer<typeof phrasesSchema>;

/** A text of the chat a phrase can come from: a tutor reply or a native version of the learner's message. */
export interface PhraseSource {
  /** The message it belongs to. */
  messageId: string;
  text: string;
}

export interface PhraseSuggestion {
  phrase: string;
  spanish: string;
  messageId: string;
}

export const MAX_PHRASES = 8;
export const MAX_PHRASE_LENGTH = 60;

export function buildPhrasesInstructions(topic: string): string {
  return `You help a native Spanish speaker learn useful English expressions from a practice conversation about "${topic}". You get texts from the conversation: the tutor's replies and native-sounding versions of the learner's own messages.

Rules:
- Pick up to ${MAX_PHRASES} words or phrases (1 to 6 words each) that a learner would want to reuse on this topic: collocations, set phrases and professional or conversational expressions. Prefer phrases to single basic words.
- Each "phrase" must be copied exactly (word for word) from the texts; it is checked and discarded if it is not there. Never invent or rewrite phrases.
- Skip basic words (the, have, good), names, and anything that only makes sense in one specific sentence.
- "spanish" is a short, natural Spanish translation or meaning (not a sentence).`;
}

export function buildPhrasesPrompt(sources: readonly PhraseSource[]): string {
  const lines = sources.map((s, i) => `${i + 1}. ${clip(s.text)}`);
  return `Texts:\n<<<\n${lines.join("\n")}\n>>>`;
}

/** Keeps the phrases found in the texts (with the message they come from), once each, skipping the ones already saved. */
export function normalizePhrases(
  raw: RawPhrases,
  sources: readonly PhraseSource[],
  alreadySaved: ReadonlySet<string>,
): PhraseSuggestion[] {
  const seen = new Set<string>();
  const result: PhraseSuggestion[] = [];
  for (const item of raw.phrases) {
    const phrase = item.phrase.trim().replace(/[.,;:!?]+$/, "");
    const spanish = item.spanish.trim();
    const key = normalizeQuote(phrase);
    if (!phrase || !spanish || phrase.length > MAX_PHRASE_LENGTH || seen.has(key) || alreadySaved.has(key)) continue;
    const source = sources.find((s) => containsPhrase(s.text, phrase));
    if (!source) continue;
    seen.add(key);
    result.push({ phrase, spanish, messageId: source.messageId });
    if (result.length >= MAX_PHRASES) break;
  }
  return result;
}
