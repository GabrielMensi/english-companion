/**
 * Counts how many times each tense appears in a text, without AI. It's the
 * denominator of the tense accuracy: run on the corrected text, it says which
 * tenses the learner needed and (minus the mistakes) used correctly.
 *
 * compromise finds the verb phrases and tags each word; the rules here decide
 * the tense from the auxiliaries, and join what compromise splits in questions
 * ("Did | she finish", "Have | you ever been"). Modals other than "would" and
 * infinitives aren't tenses, so they aren't counted.
 */
import nlp from "compromise";

import type { Tense } from "@/lib/taxonomy";

/** Bump when the rules change, so stored counts get recomputed. */
export const TENSE_COUNTER_VERSION = 1;

export type TenseCounts = Partial<Record<Tense, number>>;

interface Group {
  words: string[];
  /** compromise's tags for each word. */
  tags: string[][];
  form: string | undefined;
  start: number;
  end: number;
}

const FORM_TO_TENSE: Record<string, Tense> = {
  "simple-present": "present_simple",
  "present-progressive": "present_continuous",
  "simple-past": "past_simple",
  "past-progressive": "past_continuous",
  "present-perfect": "present_perfect",
  "present-perfect-progressive": "present_perfect_continuous",
  "past-perfect": "past_perfect",
  "past-perfect-progressive": "past_perfect_continuous",
  "simple-future": "future_will",
  "future-progressive": "future_continuous",
  "future-perfect": "future_perfect",
};

/** Words compromise sometimes tags as verbs that aren't verb phrases. */
const NOT_VERBS = new Set(["thanks", "please"]);
const IGNORED = new Set([
  "not",
  "n't",
  "never",
  "ever",
  "already",
  "just",
  "always",
  "still",
  "also",
  "really",
  "even",
  "only",
  "often",
  "usually",
  "recently",
  "finally",
]);
const DO = new Set(["do", "does", "did"]);
const HAVE = new Set(["have", "has", "had"]);
const BE = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
const MODALS = new Set(["will", "would", "shall", "can", "could", "should", "may", "might", "must"]);
const CONTRACTIONS: Record<string, string> = {
  "'m": "am",
  "'re": "are",
  "'s": "is",
  "'ve": "have",
  "'ll": "will",
  "'d": "would",
  "don't": "do",
  "doesn't": "does",
  "didn't": "did",
  "won't": "will",
  "can't": "can",
  "isn't": "is",
  "aren't": "are",
  "wasn't": "was",
  "weren't": "were",
  "haven't": "have",
  "hasn't": "has",
  "hadn't": "had",
  "wouldn't": "would",
};

export function countTenses(text: string): TenseCounts {
  const counts: TenseCounts = {};
  for (const tense of detectTenses(text)) counts[tense] = (counts[tense] ?? 0) + 1;
  return counts;
}

/** Tenses of the text's verb phrases, in order of appearance. */
export function detectTenses(text: string): Tense[] {
  const clean = stripCode(text);
  const tenses: Tense[] = [];
  const doc = nlp(clean);

  doc.sentences().forEach((sentence) => {
    const groups = verbGroups(sentence as unknown as Sentence, clean);
    const [{ offset: sentenceOffset, terms }] = sentence.json({ offset: true }) as {
      offset: { start: number };
      terms: { text: string; tags: string[]; offset: { start: number } }[];
    }[];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (precededByTo(clean, group.start)) continue; // infinitive: "want to learn"
      if (group.words.length === 1 && NOT_VERBS.has(group.words[0])) continue;
      // Imperative: a bare verb opening the sentence ("See the docs").
      const [word] = group.words;
      const isAux = DO.has(word) || HAVE.has(word) || BE.has(word) || MODALS.has(word);
      const prev = terms.findLast((t) => t.offset.start < group.start);
      const nextTerm = terms.find((t) => t.offset.start >= group.end);
      const hasSubjectBefore = prev !== undefined && (prev.tags.includes("Noun") || prev.tags.includes("Pronoun"));
      if (group.words.length === 1 && !isAux) {
        const tags = group.tags[0];
        // Imperative: a bare verb without a subject ("See the docs", "…, and fix the bug").
        if (tags.includes("Infinitive") && !hasSubjectBefore) continue;
        // Participle used as an adjective: "minified code", "the work done on…", "the code minified".
        if (tags.includes("PastTense") && isAdjectivalParticiple(tags, prev, nextTerm)) continue;
      }
      // Negative imperative: "Don't make any changes".
      if (word === "do" && group.words.length > 1 && group.start === sentenceOffset.start) continue;

      // Questions: compromise splits the auxiliary from the main verb.
      const next = groups[i + 1];
      if (group.words.length === 1 && next && canJoin(group.words[0], next)) {
        const joined = [group.words[0], ...next.words];
        i++;
        // "Are you going | to deploy": the verb after "to" belongs to the same phrase.
        const afterNext = groups[i + 1];
        if (next.words.at(-1) === "going" && afterNext && precededByTo(clean, afterNext.start)) {
          joined.push("to", ...afterNext.words);
          i++;
        }
        const tense = fromAuxiliaries(joined);
        if (tense) tenses.push(tense);
        continue;
      }

      // "Is it working?": compromise doesn't group (or even tag) the -ing verb after the subject.
      if (group.words.length === 1 && BE.has(word)) {
        const [subject, verb] = terms.filter((t) => t.offset.start >= group.end);
        if (
          subject?.tags.includes("Pronoun") &&
          verb &&
          /\w{2,}ing$/i.test(verb.text) &&
          !verb.tags.includes("Adjective")
        ) {
          tenses.push(word === "was" || word === "were" ? "past_continuous" : "present_continuous");
          continue;
        }
      }

      const tense = group.words.length > 1 ? (fromAuxiliaries(group.words) ?? formTense(group)) : formTense(group);
      if (tense) tenses.push(tense);
    }
  });
  return tenses;
}

// compromise's types don't expose the verbs plugin on sentence views.
type Sentence = { verbs(): { json(options: object): unknown } };

function verbGroups(sentence: Sentence, text: string): Group[] {
  const json = sentence.verbs().json({ offset: true }) as {
    offset: { start: number; length: number };
    terms: { text: string; normal?: string; implicit?: string; tags: string[] }[];
    verb: { grammar: { form?: string } };
  }[];
  return json.map((v) => {
    const words: string[] = [];
    const tags: string[][] = [];
    for (const term of v.terms) {
      const word = normalizeWord(term.implicit ?? term.normal ?? term.text);
      if (!word || IGNORED.has(word)) continue;
      words.push(word);
      tags.push(term.tags);
    }
    // A contracted auxiliary right before the phrase ("I'll | check", "she's | been") isn't part of it.
    const before = text
      .slice(Math.max(0, v.offset.start - 8), v.offset.start)
      .toLowerCase()
      .replace(/’/g, "'");
    const contraction = /('ll|'d|'ve|'m|'re|'s)\s*$/.exec(before);
    if (contraction && !/let's\s*$/.test(before)) {
      const participle = tags[0]?.includes("Participle") || words[0] === "been";
      const aux = contraction[1] === "'s" && participle ? "has" : CONTRACTIONS[contraction[1]];
      const hasAux =
        words[0] !== undefined && (DO.has(words[0]) || HAVE.has(words[0]) || BE.has(words[0]) || MODALS.has(words[0]));
      if (!hasAux) {
        words.unshift(aux);
        tags.unshift(["Verb", "Auxiliary"]);
      }
    }
    return { words, tags, form: v.verb.grammar.form, start: v.offset.start, end: v.offset.start + v.offset.length };
  });
}

type Term = { text: string; tags: string[] };

function isAdjectivalParticiple(tags: string[], prev: Term | undefined, next: Term | undefined): boolean {
  const isNoun = (t: Term | undefined) => t !== undefined && t.tags.includes("Noun") && !t.tags.includes("Pronoun");
  const subjectBefore = prev !== undefined && (prev.tags.includes("Noun") || prev.tags.includes("Pronoun"));
  // "shows minified code": no subject before, a noun right after.
  if (!subjectBefore && isNoun(next) && !next?.tags.includes("Date")) return true;
  // "the work done on…": only irregular participles ("done", not "came"), after a noun, closing the phrase.
  const endsPhrase = next === undefined || next.tags.includes("Preposition");
  return tags.includes("Participle") && isNoun(prev) && endsPhrase;
}

function normalizeWord(word: string): string {
  const w = word
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z']/g, "");
  return CONTRACTIONS[w] ?? w;
}

function precededByTo(text: string, start: number): boolean {
  return /\bto\s+$/i.test(text.slice(Math.max(0, start - 6), start));
}

/** Whether a lone auxiliary and the next phrase form one verb (a question or inversion). */
function canJoin(aux: string, next: Group): boolean {
  const verbIndex = next.tags.findIndex((t) => t.includes("Verb"));
  if (verbIndex < 0) return false;
  const word = next.words[verbIndex];
  const tags = next.tags[verbIndex];
  if (DO.has(aux) || MODALS.has(aux)) return tags.includes("Infinitive");
  const participle = tags.includes("Participle") || tags.includes("PastTense");
  if (HAVE.has(aux)) return participle || word === "been";
  if (BE.has(aux)) return word.endsWith("ing") || participle;
  return false;
}

/** Tense from the auxiliaries of a multi-word verb phrase ("have been working", "did not see"). */
function fromAuxiliaries(words: string[]): Tense | null {
  const [first] = words;
  const last = words.at(-1) ?? "";
  const has = (w: string) => words.includes(w);
  const progressive = last.endsWith("ing") && !has("going");

  if (first === "used" && words[1] === "to") return "used_to_would";
  if (BE.has(first) && has("going") && has("to")) return "future_going_to";
  if (first === "would") return "conditional_would";
  if (first === "will" || first === "shall") {
    if (has("have")) return "future_perfect";
    return progressive && has("be") ? "future_continuous" : "future_will";
  }
  if (MODALS.has(first)) return null;
  if (first === "do" || first === "does") return "present_simple";
  if (first === "did") return "past_simple";
  if (first === "have" || first === "has")
    return has("been") && progressive ? "present_perfect_continuous" : "present_perfect";
  if (first === "had") return has("been") && progressive ? "past_perfect_continuous" : "past_perfect";
  if (first === "am" || first === "is" || first === "are") return progressive ? "present_continuous" : "present_simple";
  if (first === "was" || first === "were") return progressive ? "past_continuous" : "past_simple";
  return null;
}

function formTense(group: Group): Tense | null {
  // Phrases compromise can't name ("shows minified"): the first verb's own tense.
  if (!group.form) {
    const tags = group.tags[0] ?? [];
    if (tags.includes("Infinitive") || tags.includes("Gerund")) return null;
    if (tags.includes("PresentTense")) return "present_simple";
    return tags.includes("PastTense") ? "past_simple" : null;
  }
  const tense = FORM_TO_TENSE[group.form];
  if (tense) return tense;
  // Passive and auxiliary forms carry the tense in their auxiliaries.
  return group.words.length > 1 ? fromAuxiliaries(group.words) : null;
}

/** Code isn't English prose: drop fenced blocks, inline code and URLs. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}
