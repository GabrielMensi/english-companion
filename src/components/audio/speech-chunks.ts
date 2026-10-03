/**
 * How a text is cut for Kokoro (pure, so it can be tested). Kokoro synthesizes one chunk at a
 * time and each chunk only plays when it's complete, so:
 * - the first chunk is short (the first sentence is cut at a clause boundary: a comma, a
 *   semicolon, a dash, or before a conjunction), so audio starts soon;
 * - each following chunk may be about twice as long as the one before, so it's synthesized while
 *   the previous one plays (on the CPU synthesis takes about half the audio's length) and there's
 *   no silence between them. Long sentences are cut at clauses to fit; once the budget is large,
 *   whole sentences are kept, which sounds more natural.
 */

/** Words before which a sentence can be cut without sounding broken. */
const CONJUNCTIONS = new Set([
  "and",
  "but",
  "or",
  "so",
  "because",
  "which",
  "while",
  "although",
  "though",
  "when",
  "if",
  "since",
  "unless",
  "whereas",
]);

const PUNCTUATION_BOUNDARY = /[,;:)—–]$|[,;:]["'”’]$/;

export interface ClauseOptions {
  /** The first chunk has at most this many words (when there's a boundary to cut at). */
  maxWords?: number;
  /** Neither part is shorter than this, so there are no one-word chunks. */
  minWords?: number;
}

/**
 * Cuts `sentence` in two at the clause boundary that leaves the longest first part within
 * `maxWords`, preferring punctuation over conjunctions. Short sentences, and long ones with no
 * boundary early enough, are returned whole.
 */
export function splitFirstClause(sentence: string, { maxWords = 8, minWords = 3 }: ClauseOptions = {}): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords + minWords) return [sentence.trim()].filter(Boolean);

  let punctuation = 0;
  let conjunction = 0;
  for (let count = minWords; count <= maxWords && words.length - count >= minWords; count++) {
    if (PUNCTUATION_BOUNDARY.test(words[count - 1])) punctuation = count;
    else if (CONJUNCTIONS.has(words[count].toLowerCase())) conjunction = count;
  }
  const cut = punctuation || conjunction;
  if (!cut) return [words.join(" ")];
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

/** Above this budget sentences are never cut. */
const MAX_BUDGET = 40;

/** The chunks to synthesize, in order, with a word budget that starts at `maxWords` and doubles. */
export function speechChunks(sentences: string[], { maxWords = 8, minWords = 3 }: ClauseOptions = {}): string[] {
  const chunks: string[] = [];
  let budget = maxWords;
  for (const sentence of sentences) {
    let rest = sentence.trim();
    while (rest) {
      const [first, remainder] =
        budget < MAX_BUDGET ? splitFirstClause(rest, { maxWords: budget, minWords }) : [rest, undefined];
      chunks.push(first);
      budget *= 2;
      rest = remainder ?? "";
    }
  }
  return chunks;
}
