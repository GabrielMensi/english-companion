/**
 * Scoring for the speech-to-text fidelity eval: did the transcript keep the
 * learner's mistake, "fix" it, or lose it? Plus word error rate against the
 * text that was read.
 */
import type { AsrSample } from "./asr-samples";

export type MistakeOutcome = "kept" | "fixed" | "lost";

export interface AsrScore {
  outcome: MistakeOutcome;
  /** Word error rate against the text read aloud (0 = perfect). */
  wer: number;
}

const NUMBERS: Record<string, string> = { "2020": "twenty twenty", "30": "thirty" };

/** Lowercase words without punctuation; contractions and a few numbers spelled out. */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b\d+\b/g, (n) => NUMBERS[n] ?? n)
    .replace(/n't\b/g, " not")
    .replace(/\bcan not\b/g, "cannot")
    .replace(/'m\b/g, " am")
    .replace(/'re\b/g, " are")
    .replace(/'ll\b/g, " will")
    .replace(/'ve\b/g, " have")
    .replace(/\b(it|he|she|that|there|what)'s\b/g, "$1 is")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreTranscript(sample: AsrSample, transcript: string): AsrScore {
  const said = ` ${normalizeTranscript(transcript)} `;
  const has = (fragment: string) => said.includes(` ${normalizeTranscript(fragment)} `);
  const outcome: MistakeOutcome = has(sample.mistake) ? "kept" : has(sample.fix) ? "fixed" : "lost";
  return { outcome, wer: wordErrorRate(sample.text, transcript) };
}

/** Word-level Levenshtein distance divided by the number of reference words. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeTranscript(reference).split(" ").filter(Boolean);
  const hyp = normalizeTranscript(hypothesis).split(" ").filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;

  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const substitution = previous[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      current.push(Math.min(substitution, previous[j] + 1, current[j - 1] + 1));
    }
    previous = current;
  }
  return Math.round((previous[hyp.length] / ref.length) * 1000) / 1000;
}
