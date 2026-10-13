/**
 * Fluency metrics for dictated messages, computed in code from speech-to-text
 * word timestamps (no AI): speaking pace, long pauses and filler words.
 */

/** A transcribed word with its position in the recording, in seconds. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Raw sums for one or more recordings, so takes and messages can be added up.
 * Rates (words per minute, …) are derived with {@link fluencySummary}.
 */
export interface FluencyMetrics {
  version: typeof FLUENCY_VERSION;
  /** Words spoken, fillers not included. */
  words: number;
  /** Time from the first word to the last one, summed over takes, in milliseconds. */
  speechMs: number;
  /** Silences between two words of at least {@link LONG_PAUSE_MS}. */
  pauses: number;
  pauseMs: number;
  longestPauseMs: number;
  /** Filler words by canonical form ("um", "este", "o sea"…). */
  fillers: Record<string, number>;
}

export const FLUENCY_VERSION = 1;

/** A silence this long between two words counts as a long pause. */
export const LONG_PAUSE_MS = 1000;

/** Hesitation sounds and Spanish fillers, by canonical form. English words with a real meaning ("like", "well") are left out. */
const FILLER_WORDS: Record<string, string> = {
  um: "um",
  umm: "um",
  ummm: "um",
  uhm: "um",
  hm: "um",
  hmm: "um",
  mm: "um",
  mmm: "um",
  erm: "um",
  uh: "uh",
  uhh: "uh",
  er: "uh",
  ah: "uh",
  eh: "eh",
  ehh: "eh",
  ehm: "eh",
  este: "este",
  bueno: "bueno",
  pues: "pues",
};

/** Multi-word fillers, as lists of normalized words. */
const FILLER_PHRASES: { words: string[]; filler: string }[] = [{ words: ["o", "sea"], filler: "o sea" }];

/** Lowercase letters only: "Um," → "um", "don't" → "dont". */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}]/gu, "");
}

/** Metrics for one recording; null when there are no timed words to measure. */
export function computeFluency(timed: TimedWord[]): FluencyMetrics | null {
  const words = timed
    .map((w) => ({ ...w, norm: normalizeWord(w.word) }))
    .filter((w) => w.norm && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start);
  if (words.length === 0) return null;

  const fillers: Record<string, number> = {};
  let fillerWords = 0;
  for (let i = 0; i < words.length; i++) {
    const phrase = FILLER_PHRASES.find((p) => p.words.every((w, j) => words[i + j]?.norm === w));
    const filler = phrase?.filler ?? FILLER_WORDS[words[i].norm];
    if (!filler) continue;
    fillers[filler] = (fillers[filler] ?? 0) + 1;
    const length = phrase?.words.length ?? 1;
    fillerWords += length;
    i += length - 1;
  }

  let pauses = 0;
  let pauseMs = 0;
  let longestPauseMs = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.round((words[i].start - words[i - 1].end) * 1000);
    if (gap >= LONG_PAUSE_MS) {
      pauses++;
      pauseMs += gap;
      longestPauseMs = Math.max(longestPauseMs, gap);
    }
  }

  const speechMs = Math.max(0, Math.round((words[words.length - 1].end - words[0].start) * 1000));
  return {
    version: FLUENCY_VERSION,
    words: words.length - fillerWords,
    speechMs,
    pauses,
    pauseMs,
    longestPauseMs,
    fillers,
  };
}

/** Adds up the metrics of several takes or messages. */
export function mergeFluency(a: FluencyMetrics | null, b: FluencyMetrics | null): FluencyMetrics | null {
  if (!a) return b;
  if (!b) return a;
  const fillers = { ...a.fillers };
  for (const [filler, count] of Object.entries(b.fillers)) fillers[filler] = (fillers[filler] ?? 0) + count;
  return {
    version: FLUENCY_VERSION,
    words: a.words + b.words,
    speechMs: a.speechMs + b.speechMs,
    pauses: a.pauses + b.pauses,
    pauseMs: a.pauseMs + b.pauseMs,
    longestPauseMs: Math.max(a.longestPauseMs, b.longestPauseMs),
    fillers,
  };
}

export interface FluencySummary {
  /** Words per minute while speaking; null when the recording is too short to tell. */
  wpm: number | null;
  /** Long pauses per minute of speech. */
  pausesPerMinute: number | null;
  fillerCount: number;
  fillersPer100Words: number;
  /** Most used fillers first. */
  topFillers: { filler: string; count: number }[];
}

/** Below this much speech, a rate per minute says more about rounding than about fluency. */
const MIN_SPEECH_MS = 2000;

export function fluencySummary(m: FluencyMetrics): FluencySummary {
  const minutes = m.speechMs / 60_000;
  const measurable = m.speechMs >= MIN_SPEECH_MS;
  const fillerCount = Object.values(m.fillers).reduce((a, b) => a + b, 0);
  return {
    wpm: measurable ? Math.round(m.words / minutes) : null,
    pausesPerMinute: measurable ? round(m.pauses / minutes) : null,
    fillerCount,
    fillersPer100Words: m.words > 0 ? round((fillerCount / m.words) * 100) : 0,
    topFillers: Object.entries(m.fillers)
      .map(([filler, count]) => ({ filler, count }))
      .sort((a, b) => b.count - a.count || a.filler.localeCompare(b.filler)),
  };
}

export interface FluencyStats {
  /** Spoken messages with fluency metrics in the period. */
  messages: number;
  current: FluencySummary | null;
  /** The same for the equally long period before, to show the trend. */
  previous: FluencySummary | null;
}

/** Dashboard panel: metrics of every dictated message in the period, added up. */
export function computeFluencyStats(
  messages: { fluency: FluencyMetrics | null }[],
  previousMessages: { fluency: FluencyMetrics | null }[],
): FluencyStats {
  const total = (list: { fluency: FluencyMetrics | null }[]) =>
    list.reduce<FluencyMetrics | null>((acc, m) => mergeFluency(acc, m.fluency), null);
  const current = total(messages);
  const previous = total(previousMessages);
  return {
    messages: messages.filter((m) => m.fluency).length,
    current: current && fluencySummary(current),
    previous: previous && fluencySummary(previous),
  };
}

/**
 * Word timestamps from a speech-to-text response body (OpenAI-style `verbose_json`,
 * as Groq and whisper.cpp return it). Anything unexpected gives an empty list.
 */
export function wordsFromResponse(body: unknown): TimedWord[] {
  const words = (body as { words?: unknown } | null)?.words;
  if (!Array.isArray(words)) return [];
  return words.flatMap((w) => {
    const { word, start, end } = (w ?? {}) as Record<string, unknown>;
    return typeof word === "string" && typeof start === "number" && typeof end === "number"
      ? [{ word, start, end }]
      : [];
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
