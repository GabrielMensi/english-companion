/**
 * Pure parts of the deferred error classification: rules, output schema,
 * prompt building and normalization. The chat detects mistakes with a coarse
 * category; this assigns the fixed fine-grained type and, for verb mistakes,
 * the tense. Kept free of server-only imports so it can be unit tested.
 */
import { z } from "@/lib/zod";
import { type ErrorCategory, type Severity, type Tense, TENSE_CATEGORIES, TENSE_HINTS, TENSES } from "@/lib/taxonomy";
import { isValidSubtype, SUBTYPES } from "@/lib/subtypes";
import { toSnakeCase } from "./analysis";

export interface ClassificationItem {
  /** Correction id. */
  id: string;
  category: ErrorCategory;
  severity: Severity;
  original: string;
  correction: string;
  explanation: string;
  /** The learner's whole message, for context. */
  message: string;
}

export interface Classification {
  status: "done" | "skipped";
  subtype: string | null;
  tense: Tense | null;
  tenseUsed: Tense | null;
}

const NONE = "none";

export const classificationSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().describe("The item number."),
      subtype: z.string().describe("One of the item's options, exactly as written."),
      tense: z
        .enum([...TENSES, NONE])
        .describe("Tense the sentence needed, or 'none' if the mistake isn't about a verb."),
      tenseUsed: z
        .enum([...TENSES, NONE])
        .describe("Tense the learner used instead, or 'none' if they used the right tense."),
    }),
  ),
});

export type RawClassification = z.infer<typeof classificationSchema>;

/**
 * Mistakes that don't need a model: suggestions aren't mistakes, typos are
 * always keyboard slips, and some categories have a single type.
 */
export function ruleClassification(item: ClassificationItem): Classification | null {
  if (item.severity === "suggestion") return { status: "skipped", subtype: null, tense: null, tenseUsed: null };
  if (item.severity === "typo" && item.category === "spelling") {
    return { status: "done", subtype: "keyboard_typo", tense: null, tenseUsed: null };
  }
  const subtypes = Object.keys(SUBTYPES[item.category]);
  if (subtypes.length === 1 && !TENSE_CATEGORIES.includes(item.category)) {
    return { status: "done", subtype: subtypes[0], tense: null, tenseUsed: null };
  }
  return null;
}

export function buildClassificationInstructions(): string {
  const tenses = TENSES.map((t) => `- ${t}: ${TENSE_HINTS[t]}`).join("\n");
  return `You classify mistakes that an English tutor already found in messages written by a native Spanish speaker. Do not look for new mistakes and do not judge whether they are real: only classify each one.

For each item, return:
- index: the item number.
- subtype: exactly one of the item's options (the name before the colon). Use "other" only if none fits.
- tense: only for items marked "verb mistake". The tense the sentence needed, from this list:
${tenses}
  For items not marked "verb mistake", or when no tense applies (e.g. an infinitive), use "none".
- tenseUsed: only for verb mistakes where the learner chose the WRONG TENSE: the tense they used instead. If they chose the right tense but formed it wrong ("I have wrote", "he go"), use "none".

Return one entry per item, in order.

Example item: category verb_tense, "I live here since 2020" → "I have lived here since 2020"
Answer: {"index": 1, "subtype": "tense_choice", "tense": "present_perfect", "tenseUsed": "present_simple"}`;
}

export function buildClassificationPrompt(items: ClassificationItem[]): string {
  return items
    .map((item, i) => {
      const options = Object.entries(SUBTYPES[item.category])
        .map(([key, info]) => `    - ${key}: ${info.hint}`)
        .join("\n");
      const verb = TENSE_CATEGORIES.includes(item.category) ? " (verb mistake)" : "";
      return `Item ${i + 1}${verb}
  Sentence: ${sentenceAround(item.message, item.original)}
  Mistake: "${item.original}" → "${item.correction}"
  Category: ${item.category}
  Tutor's note: ${item.explanation}
  Options:
${options}`;
    })
    .join("\n\n");
}

/**
 * Validates the model's answer against the fixed lists. Items the model
 * skipped are left out, so they stay pending and get retried.
 */
export function normalizeClassification(
  items: ClassificationItem[],
  raw: RawClassification,
): Map<string, Classification> {
  const results = new Map<string, Classification>();
  for (const entry of raw.items) {
    const item = items[entry.index - 1];
    if (!item || results.has(item.id)) continue;

    const subtype = toSnakeCase(entry.subtype);
    const hasTense = TENSE_CATEGORIES.includes(item.category);
    const tense = hasTense && entry.tense !== NONE ? entry.tense : null;
    // The same tense on both sides means the tense was right and the form was wrong.
    const tenseUsed = tense && entry.tenseUsed !== NONE && entry.tenseUsed !== tense ? entry.tenseUsed : null;

    results.set(item.id, {
      status: "done",
      subtype: isValidSubtype(item.category, subtype) ? subtype : "other",
      tense,
      tenseUsed,
    });
  }
  return results;
}

/**
 * The sentence of `text` that contains `fragment`, so the classifier gets
 * context without the whole message. Long sentences are cut around the fragment.
 */
export function sentenceAround(text: string, fragment: string, maxChars = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(fragment.replace(/\s+/g, " ").trim().toLowerCase());
  if (at < 0) return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars)}…`;

  const before = flat.slice(0, at);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! ")) + 1;
  const endMatch = /[.?!](\s|$)/.exec(flat.slice(at + fragment.length));
  const end = endMatch ? at + fragment.length + endMatch.index + 1 : flat.length;
  const sentence = flat.slice(start, end).trim();
  if (sentence.length <= maxChars) return sentence;

  const from = Math.max(0, at - Math.floor(maxChars / 2));
  return `…${flat.slice(from, from + maxChars).trim()}…`;
}
