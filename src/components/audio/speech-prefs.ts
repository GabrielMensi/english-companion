/**
 * Listening preferences (pure, so they can be tested). They're per browser, kept in localStorage:
 * each browser has its own voices, and Kokoro's model is cached per browser too.
 */

export type SpeechEngine = "browser" | "kokoro";

export interface SpeechPrefs {
  /** Which voice reads aloud: the browser's `speechSynthesis` or Kokoro running locally. */
  engine: SpeechEngine;
  /** `voiceURI` of the chosen browser voice; null picks the best English voice available. */
  voice: string | null;
  /** Kokoro voice id (see `KOKORO_VOICES`). */
  kokoroVoice: string;
  /** Speed for both engines; 1 is normal. */
  rate: number;
}

export interface KokoroVoice {
  id: string;
  name: string;
  accent: "US" | "UK";
  gender: "Female" | "Male";
  /** Overall grade from the model card: how good the voice sounds. */
  grade: string;
}

/**
 * Kokoro-82M v1.0 English voices, best first (grades from the model card). The lowest-graded ones
 * (D or worse) are left out: they sound noticeably worse and would only clutter the list.
 */
export const KOKORO_VOICES: readonly KokoroVoice[] = [
  { id: "af_heart", name: "Heart", accent: "US", gender: "Female", grade: "A" },
  { id: "af_bella", name: "Bella", accent: "US", gender: "Female", grade: "A-" },
  { id: "af_nicole", name: "Nicole", accent: "US", gender: "Female", grade: "B-" },
  { id: "bf_emma", name: "Emma", accent: "UK", gender: "Female", grade: "B-" },
  { id: "af_aoede", name: "Aoede", accent: "US", gender: "Female", grade: "C+" },
  { id: "af_kore", name: "Kore", accent: "US", gender: "Female", grade: "C+" },
  { id: "af_sarah", name: "Sarah", accent: "US", gender: "Female", grade: "C+" },
  { id: "am_fenrir", name: "Fenrir", accent: "US", gender: "Male", grade: "C+" },
  { id: "am_michael", name: "Michael", accent: "US", gender: "Male", grade: "C+" },
  { id: "am_puck", name: "Puck", accent: "US", gender: "Male", grade: "C+" },
  { id: "bm_fable", name: "Fable", accent: "UK", gender: "Male", grade: "C" },
  { id: "bm_george", name: "George", accent: "UK", gender: "Male", grade: "C" },
  { id: "bf_isabella", name: "Isabella", accent: "UK", gender: "Female", grade: "C" },
];

export const DEFAULT_SPEECH_PREFS: SpeechPrefs = {
  engine: "browser",
  voice: null,
  kokoroVoice: "af_heart",
  rate: 1,
};

/**
 * Reads stored preferences, filling in what's missing or invalid with the defaults, so preferences
 * saved before a field existed (e.g. before Kokoro) stay valid.
 */
export function parseSpeechPrefs(raw: string | null): SpeechPrefs {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (parsed && typeof parsed === "object") stored = parsed as Record<string, unknown>;
  } catch {
    // Corrupted value: start over with the defaults.
  }
  const d = DEFAULT_SPEECH_PREFS;
  return {
    engine: stored.engine === "kokoro" || stored.engine === "browser" ? stored.engine : d.engine,
    voice: typeof stored.voice === "string" ? stored.voice : d.voice,
    kokoroVoice:
      typeof stored.kokoroVoice === "string" && KOKORO_VOICES.some((v) => v.id === stored.kokoroVoice)
        ? stored.kokoroVoice
        : d.kokoroVoice,
    rate: typeof stored.rate === "number" && stored.rate >= 0.5 && stored.rate <= 2 ? stored.rate : d.rate,
  };
}
