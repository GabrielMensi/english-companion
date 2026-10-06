/**
 * Read-aloud scoring without AI: the learner reads a known sentence, and the
 * transcript is compared with it word by word. Where speech-to-text heard a
 * different word, both are turned into phonemes with a pronouncing dictionary
 * (CMU, ARPAbet) and the sounds that changed decide the pronunciation category.
 * Homophones (two / too) and spelling variants (colour / color) are not mistakes.
 */
import type { PronunciationCategory } from "./taxonomy";

/** Pronunciations of a word in ARPAbet ("SH IH1 P"), or undefined if the dictionary doesn't know it. */
export type Lookup = (word: string) => string[] | undefined;

export type TokenStatus = "ok" | "wrong" | "missed";

/** A piece of the sentence as shown: a word with its punctuation, or the space between words. */
export interface ReadAloudToken {
  text: string;
  /** Null for spaces and tokens without words (a dash). */
  status: TokenStatus | null;
  /** Index into `issues` when the token was heard differently. */
  issue: number | null;
}

export interface PronunciationIssue {
  /** The word(s) as written in the sentence. */
  expected: string;
  /** What speech-to-text heard instead. */
  heard: string;
  category: PronunciationCategory;
  /** The sound that changed, in IPA ("/ɪ/ → /iː/"); null when it can't be told. */
  detail: string | null;
}

export interface ReadAloudResult {
  tokens: ReadAloudToken[];
  issues: PronunciationIssue[];
  /** Words heard as written, out of `totalWords`. */
  correctWords: number;
  totalWords: number;
  /** Words that weren't heard at all. */
  missedWords: string[];
}

const SMALL_NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n: number): string {
  if (n < 20) return SMALL_NUMBERS[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${SMALL_NUMBERS[n % 10]}` : ""}`;
  return String(n);
}

/**
 * Lowercase words to compare: numbers under 100 spelled out (speech-to-text writes
 * "3" for three), contractions expanded (it's / it is sound different but mean
 * the same reading), hyphens split.
 */
export function speechWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b\d{1,2}\b/g, (n) => numberToWords(Number(n)))
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not")
    .replace(/'m\b/g, " am")
    .replace(/'re\b/g, " are")
    .replace(/'ll\b/g, " will")
    .replace(/'ve\b/g, " have")
    .replace(/\b(it|he|she|that|there|what|who|where|here|how)'s\b/g, "$1 is")
    .replace(/[^a-z' ]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Splits the sentence into words (with their punctuation) and spaces, keeping every character. */
function tokenize(text: string): { text: string; words: string[] }[] {
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((piece) => ({ text: piece, words: /\s/.test(piece) ? [] : speechWords(piece) }));
}

// ---- Phonemes -------------------------------------------------------------

interface Phone {
  /** ARPAbet without stress: "IY". */
  p: string;
  /** Vowel stress (0 unstressed, 1 primary, 2 secondary); null for consonants. */
  stress: number | null;
  /** First sound of its word. */
  wordStart: boolean;
  /** A consonant after the last vowel of its word (the -ed of worked, the -s of cats). */
  final: boolean;
}

const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);

const IPA: Record<string, string> = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ",
  ER: "ɝ", EY: "eɪ", F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "iː", JH: "dʒ", K: "k", L: "l", M: "m",
  N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p", R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ",
  UW: "uː", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

function ipa(phone: Phone): string {
  if (phone.p === "AH" && phone.stress === 0) return "ə";
  if (phone.p === "ER" && phone.stress === 0) return "ɚ";
  return IPA[phone.p] ?? phone.p.toLowerCase();
}

function parsePhones(arpabet: string): Phone[] {
  const phones = arpabet
    .trim()
    .split(/\s+/)
    .map((raw, i) => {
      const p = raw.replace(/\d/g, "");
      const digit = raw.match(/\d/)?.[0];
      return { p, stress: digit === undefined ? null : Number(digit), wordStart: i === 0, final: false };
    });
  const lastVowel = phones.findLastIndex((ph) => VOWELS.has(ph.p));
  for (let i = lastVowel + 1; i < phones.length; i++) phones[i].final = true;
  return phones;
}

/** Every pronunciation of a list of words, word by word (capped: spans are short). */
function pronunciations(words: string[], lookup: Lookup): Phone[][] | null {
  let combos: Phone[][] = [[]];
  for (const word of words) {
    const variants = lookup(word);
    if (!variants?.length) return null;
    combos = combos.flatMap((prefix) => variants.map((v) => [...prefix, ...parsePhones(v)])).slice(0, 64);
  }
  return combos;
}

type PhoneOp =
  | { kind: "same"; e: Phone; h: Phone }
  | { kind: "sub"; e: Phone; h: Phone }
  | { kind: "del"; e: Phone }
  | { kind: "ins"; h: Phone; before: Phone | null };

function phoneCost(a: string, b: string): number {
  if (a === b) return 0;
  // Vowels pair with vowels and consonants with consonants, so "bug / book" aligns /ʌ/ with /ʊ/.
  return VOWELS.has(a) === VOWELS.has(b) ? 1 : 1.6;
}

function alignPhones(expected: Phone[], heard: Phone[]): { cost: number; ops: PhoneOp[] } {
  const n = expected.length;
  const m = heard.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + phoneCost(expected[i - 1].p, heard[j - 1].p),
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
      );
    }
  }
  const ops: PhoneOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + phoneCost(expected[i - 1].p, heard[j - 1].p)) {
      const e = expected[i - 1];
      const h = heard[j - 1];
      ops.push(e.p === h.p ? { kind: "same", e, h } : { kind: "sub", e, h });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ kind: "del", e: expected[i - 1] });
      i--;
    } else {
      ops.push({ kind: "ins", h: heard[j - 1], before: expected[i] ?? null });
      j--;
    }
  }
  return { cost: d[n][m], ops: ops.reverse() };
}

/** The changed sounds, best explanation first; one category per heard word. */
const RULES: { category: PronunciationCategory; test: (op: PhoneOp) => boolean }[] = [
  { category: "th_sounds", test: (op) => op.kind !== "ins" && op.kind !== "same" && (op.e.p === "TH" || op.e.p === "DH") },
  {
    category: "b_v",
    test: (op) => op.kind === "sub" && ((op.e.p === "V" && op.h.p === "B") || (op.e.p === "B" && op.h.p === "V")),
  },
  {
    category: "h_j_sounds",
    test: (op) =>
      (op.kind !== "ins" && op.kind !== "same" && (op.e.p === "HH" || (op.e.p === "Y" && op.e.wordStart))) ||
      (op.kind === "sub" && ((op.e.p === "Y" && op.h.p === "JH") || (op.e.p === "JH" && op.h.p === "Y"))),
  },
  {
    category: "initial_s_cluster",
    test: (op) => op.kind === "ins" && VOWELS.has(op.h.p) && op.before?.p === "S" && op.before.wordStart,
  },
  {
    category: "vowel_length",
    test: (op) => op.kind === "sub" && LENGTH_PAIRS.has(`${op.e.p}-${op.h.p}`),
  },
  {
    category: "vowel_quality",
    test: (op) => op.kind === "sub" && VOWELS.has(op.e.p) && VOWELS.has(op.h.p) && op.e.stress !== 0,
  },
  { category: "final_consonants", test: (op) => (op.kind === "sub" || op.kind === "del") && op.e.final },
  {
    category: "vowel_quality",
    test: (op) => op.kind === "sub" && VOWELS.has(op.e.p) && VOWELS.has(op.h.p),
  },
];

const LENGTH_PAIRS = new Set(["IY-IH", "IH-IY", "UW-UH", "UH-UW"]);

function describe(op: PhoneOp): string | null {
  switch (op.kind) {
    case "sub":
      return `/${ipa(op.e)}/ → /${ipa(op.h)}/`;
    case "del":
      return `/${ipa(op.e)}/ dropped`;
    case "ins":
      return `extra /${ipa(op.h)}/`;
    default:
      return null;
  }
}

/** Speech-to-text often spells a learner's "estudent" as written: an e or a before s + consonant. */
function looksLikeAddedE(expected: string[], heard: string[]): boolean {
  if (expected.length !== 1 || heard.length !== 1) return false;
  const [e] = expected;
  const [h] = heard;
  return /^s[^aeiouy]/.test(e) && /^[ae]s/.test(h) && h.slice(1).startsWith(e.slice(0, 3));
}

/** Classifies a word (or a few) heard differently; null when they sound the same. */
export function classifyMismatch(
  expected: string[],
  heard: string[],
  lookup: Lookup,
): { category: PronunciationCategory; detail: string | null } | null {
  if (looksLikeAddedE(expected, heard)) return { category: "initial_s_cluster", detail: "extra /ɛ/" };

  const expectedPhones = pronunciations(expected, lookup);
  const heardPhones = pronunciations(heard, lookup);
  if (!expectedPhones || !heardPhones) return { category: "other", detail: null };

  // The closest pair of pronunciations explains the difference best ("live" is /lɪv/ or /laɪv/);
  // between equally close pairs, the most specific rule wins.
  const alignments = expectedPhones.flatMap((e) => heardPhones.map((h) => alignPhones(e, h)));
  const cost = Math.min(...alignments.map((a) => a.cost));
  if (cost === 0) return null;

  let best: { rank: number; category: PronunciationCategory; detail: string | null } | null = null;
  for (const { ops } of alignments.filter((a) => a.cost === cost)) {
    const rank = RULES.findIndex((rule) => ops.some(rule.test));
    const op = rank === -1 ? ops.find((o) => o.kind !== "same") : ops.find(RULES[rank].test);
    const verdict = {
      rank: rank === -1 ? RULES.length : rank,
      category: rank === -1 ? ("other" as const) : RULES[rank].category,
      detail: op ? describe(op) : null,
    };
    if (!best || verdict.rank < best.rank) best = verdict;
  }
  return best && { category: best.category, detail: best.detail };
}

// ---- Words ----------------------------------------------------------------

type WordOp = { kind: "match"; r: number; h: number } | { kind: "sub"; r: number; h: number } | { kind: "del"; r: number } | { kind: "ins"; h: number };

function alignWords(ref: string[], hyp: string[], same: (a: string, b: string) => boolean): WordOp[] {
  const n = ref.length;
  const m = hyp.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  const eq = Array.from({ length: n }, (_, i) => hyp.map((h) => same(ref[i], h)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + (eq[i - 1][j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  const ops: WordOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (eq[i - 1][j - 1] ? 0 : 1)) {
      ops.push({ kind: eq[i - 1][j - 1] ? "match" : "sub", r: i - 1, h: j - 1 });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ kind: "del", r: i - 1 });
      i--;
    } else {
      ops.push({ kind: "ins", h: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Short words speech-to-text writes for the e a learner adds before "st-", "sp-"… ("is student"). */
const ADDED_E_WORDS = new Set(["a", "e", "eh", "es", "is", "uh"]);

/** Compares the sentence the learner read with what speech-to-text heard. */
export function scoreReading(expectedText: string, transcript: string, lookup: Lookup): ReadAloudResult {
  const pieces = tokenize(expectedText);
  const ref: { word: string; token: number }[] = pieces.flatMap((piece, token) => piece.words.map((word) => ({ word, token })));
  const hyp = speechWords(transcript);

  const homophones = (a: string, b: string) => {
    if (a === b) return true;
    const pa = lookup(a)?.map((v) => v.replace(/\d/g, ""));
    const pb = lookup(b)?.map((v) => v.replace(/\d/g, ""));
    return !!pa && !!pb && pa.some((v) => pb.includes(v));
  };
  const ops = alignWords(
    ref.map((r) => r.word),
    hyp,
    homophones,
  );

  const status: TokenStatus[] = ref.map(() => "ok");
  const issueOf: (number | null)[] = ref.map(() => null);
  const issues: PronunciationIssue[] = [];
  const missedWords: string[] = [];

  function addIssue(refs: number[], heardWords: string[]) {
    const verdict = classifyMismatch(
      refs.map((r) => ref[r].word),
      heardWords,
      lookup,
    );
    if (!verdict) return; // They sound the same ("ice cream" / "icecream").
    const index = issues.length;
    issues.push({ expected: refs.map((r) => ref[r].word).join(" "), heard: heardWords.join(" "), ...verdict });
    for (const r of refs) {
      status[r] = "wrong";
      issueOf[r] = index;
    }
  }

  // Runs of consecutive differences are compared together.
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "match") {
      k++;
      continue;
    }
    const run: WordOp[] = [];
    while (k < ops.length && ops[k].kind !== "match") run.push(ops[k++]);
    const refs = run.flatMap((op) => ("r" in op ? [op.r] : []));
    const heard = run.flatMap((op) => ("h" in op ? [hyp[op.h]] : []));

    if (refs.length === 0) {
      // Extra words. Before an s + consonant word, they are usually the added e ("es student").
      const next = ops[k];
      if (next && "r" in next && heard.length === 1 && ADDED_E_WORDS.has(heard[0]) && /^s[^aeiouy]/.test(ref[next.r].word)) {
        const index = issues.length;
        issues.push({
          expected: ref[next.r].word,
          heard: `${heard[0]} ${ref[next.r].word}`,
          category: "initial_s_cluster",
          detail: "extra /ɛ/",
        });
        status[next.r] = "wrong";
        issueOf[next.r] = index;
      }
    } else if (heard.length === 0) {
      for (const r of refs) {
        status[r] = "missed";
        missedWords.push(ref[r].word);
      }
    } else if (refs.length === heard.length) {
      refs.forEach((r, i) => addIssue([r], [heard[i]]));
    } else {
      addIssue(refs, heard);
    }
  }

  const tokens: ReadAloudToken[] = pieces.map((piece, t) => {
    const words = ref.flatMap((r, i) => (r.token === t ? [i] : []));
    if (words.length === 0) return { text: piece.text, status: null, issue: null };
    const worst = words.find((i) => status[i] === "wrong") ?? words.find((i) => status[i] === "missed") ?? words[0];
    return { text: piece.text, status: status[worst], issue: issueOf[worst] };
  });

  return {
    tokens,
    issues,
    correctWords: status.filter((s) => s === "ok").length,
    totalWords: ref.length,
    missedWords,
  };
}
