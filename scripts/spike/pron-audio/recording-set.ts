/**
 * SPIKE (#136): what to record for the real-recordings eval. Same sentences as the synthetic set
 * (clips.ts), so the real results can be compared with the Kokoro ones: each sentence read
 * normally, with the wrong syllable stressed, and with every vowel said in full (no schwa);
 * plus three sentences with a strong Spanish accent.
 */
import { CLIPS, type Clip, type SpikeCategory } from "./clips";

export interface ManifestClip {
  /** File name inside the folder, e.g. "develop-ok.wav". */
  file: string;
  text: string;
  /** ok: read normally; schwa / stress / accent: read with that deliberate error. */
  kind: Clip["variant"];
  /** Categories the clip should show; empty for normal readings. */
  errors: SpikeCategory[];
  /** If given, a hint must be about one of these words to count as found. */
  words?: string[];
  /** The syllable (0-based) of `word` that is stressed in the clip. */
  stress?: { word: string; syllable: number };
  /** What to do when recording. */
  how: string;
}

const HOW_ACCENT =
  "Read it like a Spanish speaker with a strong accent: th as t or d, v as b, short clipped vowels, an extra e before st-.";

function describe(clip: Clip): string {
  const syllables = clip.syllables ?? [];
  const spelled = (stressed: number) => syllables.map((s, i) => (i === stressed ? s.toUpperCase() : s)).join("-");
  switch (clip.variant) {
    case "ok":
      return clip.word
        ? "Read it normally, at your natural pace and with your own accent. Do not try to sound perfect."
        : "Read it normally, with your own accent.";
    case "stress":
      return `Put the stress on the wrong syllable of "${clip.word}": ${spelled(clip.stressed ?? 0)}. Exaggerate it a little.`;
    case "schwa":
      return clip.word === "to"
        ? 'Say "to" and "the" in full everywhere: "too", "thee" (never "tuh", "thuh").'
        : `Say every vowel of "${clip.word}" in full, as it is spelled, like reading it letter by letter (no weak vowels).`;
    case "accent":
      return HOW_ACCENT;
  }
}

/** Every clip of the set, in recording order. */
export function recordingSet(): ManifestClip[] {
  const seen = new Set<string>();
  return CLIPS.filter((c) => !seen.has(c.id) && seen.add(c.id)).map((clip) => ({
    file: `${clip.id}.wav`,
    text: clip.text,
    kind: clip.variant,
    errors: clip.expected,
    ...(clip.word && clip.variant !== "accent" && clip.variant !== "ok" && clip.variant !== "stress"
      ? { words: [clip.word] }
      : {}),
    ...(clip.word && clip.word !== "to" && clip.stressed !== undefined
      ? { stress: { word: clip.word, syllable: clip.stressed } }
      : {}),
    how: describe(clip),
  }));
}

/** The sentences to record first if time is short: one of each kind. */
export const MINIMUM_SET = ["develop", "photographer", "banana", "to", "student-accent"];
export const isMinimum = (clip: ManifestClip) => MINIMUM_SET.some((key) => clip.file.startsWith(`${key}-`));
