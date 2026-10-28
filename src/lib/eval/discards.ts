/**
 * Discarded corrections as eval examples: every correction the learner discarded as wrong is a
 * case where the model must NOT report that fragment again. Pure conversion (no database), so
 * it has tests; `scripts/eval/export-discards.mts` reads the rows and writes the file.
 *
 * The learner's text is private: the output goes to `.eval-results/` (gitignored), never to git.
 */

export interface DiscardedRow {
  messageId: string;
  /** What the learner wrote (the message the correction was about). */
  content: string;
  inputMode: "typed" | "spoken";
  /** The fragment the model flagged. */
  original: string;
  discardReason: string | null;
}

/** An eval sample in the shape of `scripts/eval/samples.ts`, plus the fragments that must stay unflagged. */
export interface DiscardSample {
  text: string;
  expect: [];
  /** Fragments the learner discarded: no reported error may overlap them. */
  forbidden: string[];
  inputMode: "typed" | "spoken";
  /** Why each was discarded (only the ones the learner explained); for reading the results, not for scoring. */
  reasons: string[];
}

/** One sample per message; repeated fragments are listed once, and fragments not found in the message are dropped. */
export function discardsToSamples(rows: readonly DiscardedRow[]): DiscardSample[] {
  const byMessage = new Map<string, DiscardSample>();
  for (const row of rows) {
    const original = row.original.trim();
    if (!original || !row.content.trim()) continue;
    if (!row.content.toLowerCase().includes(original.toLowerCase())) continue;
    let sample = byMessage.get(row.messageId);
    if (!sample) {
      sample = { text: row.content, expect: [], forbidden: [], inputMode: row.inputMode, reasons: [] };
      byMessage.set(row.messageId, sample);
    }
    if (!sample.forbidden.some((f) => f.toLowerCase() === original.toLowerCase())) sample.forbidden.push(original);
    const reason = row.discardReason?.trim();
    if (reason) sample.reasons.push(`${original}: ${reason}`);
  }
  return [...byMessage.values()];
}

/** Where the exported samples go and where the evals read them from. */
export const DISCARDS_FILE = ".eval-results/discards.json";
