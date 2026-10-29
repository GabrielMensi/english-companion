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
  /** The chat's mode, reply rule (topic or tense practice) and the turns before the message. */
  context?: DiscardContext;
}

export interface DiscardContext {
  mode: "correction" | "conversation";
  practiceRule?: string;
  history: { learner: string | null; assistant: string | null }[];
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
  /** The chat the message came from, so the eval builds the same prompt as the app. */
  context?: DiscardContext;
}

/** One sample per message; repeated fragments are listed once, and fragments not found in the message are dropped. */
export function discardsToSamples(rows: readonly DiscardedRow[]): DiscardSample[] {
  return groupDiscards(rows).samples;
}

/** Same as `discardsToSamples`, also telling how many rows were left out (fragment no longer in the text). */
export function groupDiscards(rows: readonly DiscardedRow[]): { samples: DiscardSample[]; dropped: number } {
  let dropped = 0;
  const byMessage = new Map<string, DiscardSample>();
  for (const row of rows) {
    const original = row.original.trim();
    if (!original || !row.content.trim() || !row.content.toLowerCase().includes(original.toLowerCase())) {
      dropped++;
      continue;
    }
    let sample = byMessage.get(row.messageId);
    if (!sample) {
      sample = {
        text: row.content,
        expect: [],
        forbidden: [],
        inputMode: row.inputMode,
        reasons: [],
        context: row.context,
      };
      byMessage.set(row.messageId, sample);
    }
    if (!sample.forbidden.some((f) => f.toLowerCase() === original.toLowerCase())) sample.forbidden.push(original);
    const reason = row.discardReason?.trim();
    if (reason) sample.reasons.push(`${original}: ${reason}`);
  }
  return { samples: [...byMessage.values()], dropped };
}

const STOP_WORDS = new Set(
  "a an the to of in on at for and or but is are am was were be been i you he she it we they my your this that with".split(
    " ",
  ),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Whether `inner` appears in `outer` as consecutive whole words. */
function containsRun(outer: string[], inner: string[]): boolean {
  for (let i = 0; i + inner.length <= outer.length; i++) {
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  }
  return false;
}

/**
 * Whether a reported error repeats a discarded one: they share a whole word that isn't a function
 * word ("go there" vs "we go"), or, when the discarded fragment is only function words, they match
 * as phrases. Substrings inside words don't count ("go" vs "going").
 */
export function repeatsDiscard(reported: string, discarded: string): boolean {
  const a = words(reported);
  const b = words(discarded);
  if (a.length === 0 || b.length === 0) return false;
  const content = b.filter((w) => !STOP_WORDS.has(w));
  if (content.length === 0) return containsRun(a, b) || containsRun(b, a);
  const reportedWords = new Set(a);
  return content.some((w) => reportedWords.has(w));
}

/** Where the exported samples go and where the evals read them from. */
export const DISCARDS_FILE = ".eval-results/discards.json";
