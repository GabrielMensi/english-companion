/**
 * SPIKE (#134): word stress from prosody. For each vowel of a word, over the frames the phoneme
 * recognizer aligned it to: loudness (peak dB), pitch (median F0) and length. Each feature, and
 * their sums, vote for the vowel that stands out; the scripts count how often that is the vowel
 * the speaker stressed.
 */
import type { HeardPhone } from "../../../src/lib/phonemes-core";
import type { prosody } from "./audio";

export interface VowelFeatures {
  db: number;
  f0: number;
  length: number;
}

/** Features of each vowel of a word, from the frames it was heard in. `vowels` are in word order. */
export function vowelFeatures(frames: ReturnType<typeof prosody>, vowels: HeardPhone[]): VowelFeatures[] {
  return vowels.map((v, i) => {
    const start = v.start;
    const end = Math.min(vowels[i + 1]?.start ?? v.end + 4, v.end + 6);
    const span = frames.slice(Math.max(start - 1, 0), end + 1);
    const voiced = span.filter((f) => f.f0 > 0).map((f) => f.f0);
    return {
      db: Math.max(...span.map((f) => f.db)),
      f0: voiced.length ? voiced.sort((a, b) => a - b)[Math.floor(voiced.length / 2)] : 0,
      length: end - start + 1,
    };
  });
}

const zscores = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - mean) / sd);
};

/** Which combinations of features to try. */
export const STRESS_SCORERS = {
  all: ["db", "f0", "length"],
  loudness: ["db"],
  pitch: ["f0"],
  length: ["length"],
  "loudness+length": ["db", "length"],
  "pitch+length": ["f0", "length"],
  "loudness+pitch": ["db", "f0"],
} as const;

export type StressScorer = keyof typeof STRESS_SCORERS;

/** The index of the vowel that stands out most under each scorer. */
export function stressGuesses(features: VowelFeatures[]): Record<StressScorer, number> {
  const z = {
    db: zscores(features.map((f) => f.db)),
    f0: zscores(features.map((f) => f.f0)),
    length: zscores(features.map((f) => f.length)),
  };
  return Object.fromEntries(
    Object.entries(STRESS_SCORERS).map(([name, keys]) => {
      const score = features.map((_, i) => keys.reduce((sum, k) => sum + z[k][i], 0));
      return [name, score.indexOf(Math.max(...score))];
    }),
  ) as Record<StressScorer, number>;
}
