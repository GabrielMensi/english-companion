/**
 * SPIKE (#74): helpers for the phoneme experiment. Reading WAVs, aligning
 * phoneme sequences and a rough prosody measure (loudness and pitch per frame).
 */
import fs from "node:fs";

/** Reads a 16-bit PCM mono WAV (what `encodeWav` writes and the app records). */
export function readWav(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(file);
  const sampleRate = buf.readUInt32LE(24);
  let offset = 12;
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(offset + 8 + i * 2) / 0x8000;
      return { samples, sampleRate };
    }
    offset += 8 + size;
  }
  throw new Error(`No data chunk in ${file}`);
}

const VOWEL = /[aeiouæɑɐɒɔəɚɛɜɪʊʌᵻ]/;
export const isVowel = (token: string) => VOWEL.test(token);

/** Vowels a native speaker reduces in unstressed syllables. */
export const REDUCED = new Set(["ə", "ɚ", "ɐ", "ᵻ", "əl"]);

/**
 * Splits IPA into the recognizer's tokens (longest match first), dropping
 * stress marks. Each token keeps the index of the word it belongs to and
 * whether it carried primary stress.
 */
export function tokenizeIpa(ipa: string, vocab: Set<string>) {
  const longest = Math.max(...[...vocab].map((t) => t.length));
  const tokens: { token: string; word: number; stressed: boolean }[] = [];
  ipa.split(/\s+/).forEach((word, w) => {
    let i = 0;
    let stress = false;
    while (i < word.length) {
      const ch = word[i];
      if (ch === "ˈ") {
        stress = true;
        i++;
        continue;
      }
      if (ch === "ˌ" || ch === "ː" || ch === "'") {
        i++;
        continue;
      }
      let match = "";
      for (let len = Math.min(longest, word.length - i); len > 0; len--) {
        const piece = word.slice(i, i + len);
        if (vocab.has(piece)) {
          match = piece;
          break;
        }
      }
      if (!match) {
        i++;
        continue;
      }
      const vowel = isVowel(match);
      tokens.push({ token: match, word: w, stressed: vowel && stress });
      if (vowel) stress = false;
      i += match.length;
    }
  });
  return tokens;
}

/** Levenshtein alignment: for each `a` index, the `b` index it lines up with (or -1). */
export function align(a: string[], b: string[]): number[] {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      // A vowel for a vowel is a cheaper substitution than a vowel for a consonant.
      const sub = a[i - 1] === b[j - 1] ? 0 : isVowel(a[i - 1]) === isVowel(b[j - 1]) ? 1 : 1.5;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
    }
  }
  const map = Array<number>(a.length).fill(-1);
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    const sub = a[i - 1] === b[j - 1] ? 0 : isVowel(a[i - 1]) === isVowel(b[j - 1]) ? 1 : 1.5;
    if (d[i][j] === d[i - 1][j - 1] + sub) {
      map[i - 1] = j - 1;
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return map;
}

/** Phoneme error rate of `hyp` against `ref`. */
export function per(ref: string[], hyp: string[]): number {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array<number>(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
  }
  return d[ref.length][hyp.length] / Math.max(ref.length, 1);
}

/** Loudness (dB) and pitch (Hz, 0 when unvoiced) for each 20 ms frame, wav2vec2's frame rate. */
export function prosody(samples: Float32Array, sampleRate: number) {
  const hop = Math.round(sampleRate * 0.02);
  const win = hop * 2;
  const minLag = Math.round(sampleRate / 400);
  const maxLag = Math.round(sampleRate / 75);
  const frames: { db: number; f0: number }[] = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    const x = samples.subarray(start, start + win);
    let energy = 0;
    for (const v of x) energy += v * v;
    const db = 10 * Math.log10(energy / win + 1e-10);
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i + lag < x.length; i++) r += x[i] * x[i + lag];
      r /= energy + 1e-10;
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    frames.push({ db, f0: best > 0.5 ? sampleRate / bestLag : 0 });
  }
  return frames;
}
