/**
 * Read-aloud from the audio, without AI: a wav2vec2 phoneme recognizer says which sounds were
 * said (IPA), and they are compared with the sounds the sentence should have (CMU dictionary →
 * IPA). Finds reduced vowels pronounced in full (schwa, weak forms) and confirms or adds to what
 * the transcript-based check (`pronunciation-core.ts`) found. See docs/voice/PRONUNCIATION_AUDIO.md.
 *
 * Pure (no model, no `server-only`): the model runs in `phonemes.ts`. Everything here is beta:
 * nothing is saved or counted in stats until the real-recordings eval (#136).
 */
import type { Lookup } from "./pronunciation-core";
import { speechWords } from "./pronunciation-core";
import type { PronunciationCategory } from "./taxonomy";

export const PHONEME_MODEL_ID = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";

// ---- Audio and model output -------------------------------------------------

/** A 16-bit PCM mono WAV (what the app records) as samples, or null if it isn't one. */
export function parseWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true);
    const id = tag(offset);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      if (channels !== 1 || bits !== 16 || sampleRate === 0) return null;
      const length = Math.floor(Math.min(size, bytes.length - offset - 8) / 2);
      const samples = new Float32Array(length);
      for (let i = 0; i < length; i++) samples[i] = view.getInt16(offset + 8 + i * 2, true) / 0x8000;
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** A sound the recognizer heard, with the 20 ms frames it spans. */
export interface HeardPhone {
  token: string;
  start: number;
  end: number;
}

/** Greedy CTC decoding of the logits (frames × classes): the best class per frame, repeats merged, blanks (id 0) dropped. */
export function decodeCtc(
  logits: ArrayLike<number>,
  frames: number,
  classes: number,
  idToToken: Record<number, string>,
): HeardPhone[] {
  const out: HeardPhone[] = [];
  let prev = -1;
  for (let f = 0; f < frames; f++) {
    let best = 0;
    for (let c = 1; c < classes; c++) if (logits[f * classes + c] > logits[f * classes + best]) best = c;
    const token = idToToken[best];
    if (best !== 0 && best === prev) out[out.length - 1].end = f;
    else if (best !== 0 && token && !token.startsWith("<")) out.push({ token, start: f, end: f });
    prev = best;
  }
  return out;
}

/** The recognizer glues an r to some vowels ("ɔːɹ") and an l to schwa ("əl"): split them back. */
const FUSED: Record<string, string[]> = {
  ɑːɹ: ["ɑː", "ɹ"],
  ɔːɹ: ["ɔː", "ɹ"],
  oːɹ: ["oː", "ɹ"],
  ɛɹ: ["ɛ", "ɹ"],
  ɪɹ: ["ɪ", "ɹ"],
  ʊɹ: ["ʊ", "ɹ"],
  əl: ["ə", "l"],
};

export function splitFused(heard: HeardPhone[]): HeardPhone[] {
  return heard.flatMap((h) => (FUSED[h.token] ?? [h.token]).map((token) => ({ ...h, token })));
}

// ---- Sounds ---------------------------------------------------------------

const VOWEL = /[aeiouæɑɐɒɔəɚɛɜɪʊʌᵻ]/;
export const isVowel = (token: string): boolean => VOWEL.test(token);

/** Vowels a native speaker reduces in unstressed syllables. */
export const REDUCED = new Set(["ə", "ɚ", "ɐ", "ᵻ"]);

const ARPA_TOKEN: Record<string, string> = {
  AA: "ɑː",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔː",
  AW: "aʊ",
  AY: "aɪ",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  EH: "ɛ",
  ER: "ɜː",
  EY: "eɪ",
  F: "f",
  G: "ɡ",
  HH: "h",
  IH: "ɪ",
  IY: "iː",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  OW: "oʊ",
  OY: "ɔɪ",
  P: "p",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  UH: "ʊ",
  UW: "uː",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

export interface ExpectedPhone {
  token: string;
  /** Index in the sentence's words. */
  word: number;
  /** A reduced vowel (schwa) the word should have. */
  reduced: boolean;
}

/** ARPAbet ("AH0 B AW1 T") as recognizer tokens: unstressed AH is schwa, unstressed ER is ɚ. */
function arpabetTokens(arpabet: string, word: number): ExpectedPhone[] {
  return arpabet
    .trim()
    .split(/\s+/)
    .map((raw) => {
      const p = raw.replace(/\d/g, "");
      const unstressed = raw.endsWith("0");
      if (p === "AH" && unstressed) return { token: "ə", word, reduced: true };
      if (p === "ER" && unstressed) return { token: "ɚ", word, reduced: true };
      return { token: ARPA_TOKEN[p] ?? p.toLowerCase(), word, reduced: false };
    });
}

/**
 * Short words a native speaker weakens in running speech (the dictionary has their full form:
 * "to" is /tuː/). Not checked at the end of the sentence or before a vowel (to eat, the apple),
 * where the full form is natural. Only words where the full form is clearly the learner's habit
 * (the stressed forms "at", "are", "have"… are normal in many contexts and were left out).
 */
const WEAK_FORMS: Record<string, string[]> = {
  a: ["ə"],
  an: ["ə", "n"],
  and: ["ə", "n", "d"],
  can: ["k", "ə", "n"],
  for: ["f", "ɚ"],
  from: ["f", "ɹ", "ə", "m"],
  of: ["ə", "v"],
  than: ["ð", "ə", "n"],
  the: ["ð", "ə"],
  to: ["t", "ə"],
  was: ["w", "ə", "z"],
};
const KEEP_FULL_BEFORE_VOWEL = new Set(["to", "the", "a", "an"]);

/** What `word` should sound like: every pronunciation of it. Empty when the dictionary doesn't know it. */
function expectedVariants(
  words: string[],
  index: number,
  lookup: Lookup,
  vowelStart: (word: string) => boolean,
): ExpectedPhone[][] {
  const word = words[index];
  const weak = WEAK_FORMS[word];
  const next = words[index + 1];
  if (weak && next !== undefined && !(KEEP_FULL_BEFORE_VOWEL.has(word) && vowelStart(next))) {
    return [weak.map((token) => ({ token, word: index, reduced: token === "ə" || token === "ɚ" }))];
  }
  return (lookup(word) ?? []).map((v) => arpabetTokens(v, index));
}

// ---- Alignment ------------------------------------------------------------

const subCost = (a: string, b: string) => (a === b ? 0 : isVowel(a) === isVowel(b) ? 1 : 1.5);

/** Levenshtein alignment of two sound lists: for each `a` index, the `b` index it lines up with (or -1), and its cost. */
export function alignTokens(a: string[], b: string[]): { map: number[]; cost: number } {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]));
    }
  }
  const map = Array<number>(a.length).fill(-1);
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (d[i][j] === d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1])) {
      map[i - 1] = j - 1;
      i--;
      j--;
    } else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return { map, cost: d[a.length][b.length] };
}

/** Phoneme error rate of `hyp` against `ref`, 0–1 or more. */
export function phonemeErrorRate(ref: string[], hyp: string[]): number {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array<number>(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
  }
  return d[ref.length][hyp.length] / Math.max(ref.length, 1);
}

// ---- Analysis -------------------------------------------------------------

/** A sound the sentence should have, with what was heard in its place ("∅": nothing). */
interface Slot extends ExpectedPhone {
  heard: string;
}

export interface PhonemeHint {
  /** `schwa_reduction` for reduced vowels said in full; the existing sound categories for extra findings. */
  category: PronunciationCategory;
  /** The word as written in the sentence. */
  word: string;
  /** The sound expected and the one heard, in IPA ("/ə/ → /ɑː/"). */
  detail: string;
}

/** What the sounds say about a mistake the transcript check found (by its index in `ReadAloudResult.issues`). */
export interface IssueCheck {
  issue: number;
  /** `confirmed`: the sounds changed the same way. `not_heard`: the sounds were right (maybe the transcript misheard). */
  verdict: "confirmed" | "not_heard" | "unclear";
  detail: string | null;
}

export interface PhonemeAnalysis {
  /** What was heard, as one IPA string. */
  heard: string;
  hints: PhonemeHint[];
  checks: IssueCheck[];
}

/** Sounds that stand in for /θ/ and /ð/ in Spanish-accented English. */
const TH_SUBSTITUTES = new Set(["t", "d", "s", "z", "f", "t̪", "d̪"]);
const B_LIKE = new Set(["b", "β", "p"]);

/** Vowels grouped so the recognizer's spelling variants (ɑ/ɑː, oʊ/o, eɪ/e) don't count as different. */
const VOWEL_FAMILY: Record<string, string> = {
  iː: "i",
  i: "i",
  ɪ: "ɪ",
  ᵻ: "ɪ",
  e: "e",
  eː: "e",
  eɪ: "e",
  ɛ: "ɛ",
  æ: "æ",
  ɑ: "ɑ",
  ɑː: "ɑ",
  ɒ: "ɑ",
  a: "ɑ",
  aː: "ɑ",
  ʌ: "ʌ",
  ɐ: "ʌ",
  ɔ: "ɔ",
  ɔː: "ɔ",
  o: "o",
  oː: "o",
  oʊ: "o",
  əʊ: "o",
  ʊ: "ʊ",
  u: "u",
  uː: "u",
  ɜ: "ɜ",
  ɜː: "ɜ",
  ɚ: "ɜ",
  ə: "ə",
};

const startsWithVowel = (lookup: Lookup) => (word: string) => {
  const first = lookup(word)?.[0].match(/^[A-Z]+/)?.[0];
  return first
    ? ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"].includes(first)
    : /^[aeiou]/.test(word);
};

/** The sentence's expected sounds lined up with what was heard. */
export function alignSentence(text: string, heardRaw: HeardPhone[], lookup: Lookup) {
  const words = speechWords(text);
  const heard = splitFused(heardRaw);
  const heardTokens = heard.map((h) => h.token);
  const vowelStart = startsWithVowel(lookup);

  // One pronunciation per word: the one that fits what was heard best ("record" is noun or verb).
  const variants = words.map((_, i) => expectedVariants(words, i, lookup, vowelStart));
  const chosen = variants.map((v) => v[0] ?? []);
  const cost = () =>
    alignTokens(
      chosen.flat().map((p) => p.token),
      heardTokens,
    ).cost;
  variants.forEach((options, i) => {
    if (options.length < 2) return;
    let best = Infinity;
    let pick = options[0];
    for (const option of options) {
      chosen[i] = option;
      const c = cost();
      if (c < best) {
        best = c;
        pick = option;
      }
    }
    chosen[i] = pick;
  });

  const expected = chosen.flat();
  const { map } = alignTokens(
    expected.map((p) => p.token),
    heardTokens,
  );
  /** `heardIndex` is the index in `heard` (−1: nothing lined up with it). */
  const slots = expected.map((p, i): Slot & { heardIndex: number } => ({
    ...p,
    heard: map[i] >= 0 ? heardTokens[map[i]] : "∅",
    heardIndex: map[i],
  }));
  return { words, heard, slots };
}

/** Compares the sounds heard in a reading with the ones the sentence should have. */
export function analyzePhonemes(
  text: string,
  issues: { expected: string; category: PronunciationCategory }[],
  heardRaw: HeardPhone[],
  lookup: Lookup,
): PhonemeAnalysis {
  const { words, heard, slots } = alignSentence(text, heardRaw, lookup);
  const heardTokens = heard.map((h) => h.token);
  const slotsOf = (word: number) => slots.filter((s) => s.word === word);

  const hints: PhonemeHint[] = [];

  // Schwa: a reduced vowel heard as a full one (ɪ is a normal way to reduce, so it doesn't count).
  slots.forEach((s) => {
    // The recognizer often writes an r-colored schwa (ɚ) as ɜː, which isn't a full vowel here.
    const rColored = s.token === "ɚ" && (s.heard === "ɜː" || s.heard === "ɜ");
    if (s.reduced && isVowel(s.heard) && !REDUCED.has(s.heard) && s.heard !== "ɪ" && !rColored) {
      hints.push({ category: "schwa_reduction", word: words[s.word], detail: `/${s.token}/ → /${s.heard}/` });
    }
  });

  // Which words the transcript check already flagged, to annotate those issues and to find the others.
  const flagged = new Set<number>();
  const checks: IssueCheck[] = [];
  issues.forEach((issue, n) => {
    const target = issue.expected.split(" ");
    const starts = words.flatMap((_, i) => (target.every((w, k) => words[i + k] === w) ? [i] : []));
    const span = starts.flatMap((i) => target.map((_, k) => i + k));
    span.forEach((w) => flagged.add(w));
    checks.push({ issue: n, ...checkIssue(issue.category, span.flatMap(slotsOf)) });
  });

  // Extra findings in words the transcript heard as written: th and b/v only (the clearest sounds).
  slots.forEach((s) => {
    if (flagged.has(s.word)) return;
    const found =
      ((s.token === "θ" || s.token === "ð") && TH_SUBSTITUTES.has(s.heard) && "th_sounds") ||
      (s.token === "v" && B_LIKE.has(s.heard) && "b_v");
    if (found) hints.push({ category: found, word: words[s.word], detail: `/${s.token}/ → /${s.heard}/` });
  });

  return { heard: heardTokens.join(""), hints: dedupe(hints), checks };
}

function dedupe(hints: PhonemeHint[]): PhonemeHint[] {
  const seen = new Set<string>();
  return hints.filter((h) => {
    const key = `${h.category}|${h.word}|${h.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Did the sounds change the way the transcript check says? Looks at the sounds of the category in the flagged words. */
function checkIssue(category: PronunciationCategory, slots: Slot[]): Omit<IssueCheck, "issue"> {
  let relevant: Slot[];
  let changed: (s: Slot) => boolean;
  if (category === "th_sounds") {
    relevant = slots.filter((s) => s.token === "θ" || s.token === "ð");
    changed = (s) => TH_SUBSTITUTES.has(s.heard);
  } else if (category === "b_v") {
    relevant = slots.filter((s) => s.token === "b" || s.token === "v");
    changed = (s) => (s.token === "v" ? B_LIKE.has(s.heard) : s.heard === "v");
  } else if (category === "vowel_length" || category === "vowel_quality") {
    relevant = slots.filter((s) => isVowel(s.token) && !s.reduced && VOWEL_FAMILY[s.token]);
    changed = (s) => !!VOWEL_FAMILY[s.heard] && VOWEL_FAMILY[s.heard] !== VOWEL_FAMILY[s.token];
  } else {
    return { verdict: "unclear", detail: null };
  }
  const hit = relevant.find(changed);
  if (hit) return { verdict: "confirmed", detail: `/${hit.token}/ → /${hit.heard}/` };
  const heardAll = relevant.length > 0 && relevant.every((s) => s.heard !== "∅");
  return heardAll && relevant.every((s) => s.heard === s.token || VOWEL_FAMILY[s.heard] === VOWEL_FAMILY[s.token])
    ? { verdict: "not_heard", detail: null }
    : { verdict: "unclear", detail: null };
}

/** What /api/read-aloud/phonemes answers. */
export type PhonemeCheckResult =
  | { status: "ready"; analysis: PhonemeAnalysis; ms: number }
  /** The model is being downloaded or loaded (progress 0–1 when known). */
  | { status: "preparing"; progress: number | null }
  | { status: "unavailable"; reason: string };
