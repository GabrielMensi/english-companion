/**
 * SPIKE (#74, docs/voice/PRONUNCIATION_AUDIO.md): not product code.
 *
 * A synthetic test set with known pronunciation errors. Kokoro reads IPA
 * directly, so every clip says exactly what we wrote: the correct version, the
 * word with the stress moved, the word with full vowels instead of schwa, or a
 * whole sentence with a Spanish-speaker accent. That gives a ground truth to
 * score detectors against, which real recordings (still none) don't have.
 */
import { PRONUNCIATION_CATEGORIES } from "../../../src/lib/taxonomy";

/** The product taxonomy plus the two categories this spike is about. */
export const SPIKE_CATEGORIES = [...PRONUNCIATION_CATEGORIES, "word_stress", "schwa_reduction"] as const;
export type SpikeCategory = (typeof SPIKE_CATEGORIES)[number];

export type Variant = "ok" | "stress" | "schwa" | "accent";

export interface Clip {
  id: string;
  text: string;
  /** The word the clip is about (empty for whole-sentence accent clips). */
  word: string;
  variant: Variant;
  /** Kokoro input (espeak-style IPA, ˈ = primary stress). */
  ipa: string;
  /** Categories that should be reported; empty for correct clips. */
  expected: SpikeCategory[];
  /** Syllables of `word` and which one (0-based) the clip stresses. */
  syllables?: string[];
  stressed?: number;
  /** Whether the unstressed vowels of `word` are reduced (schwa) in the clip. */
  reduced?: boolean;
}

interface Item {
  key: string;
  text: string;
  word: string;
  syllables: string[];
  /** Correct stressed syllable. */
  stressed: number;
  ok: string;
  stress?: { ipa: string; stressed: number };
  schwa?: string;
}

const ITEMS: Item[] = [
  {
    key: "develop",
    text: "We need to develop a better plan.",
    word: "develop",
    syllables: ["de", "vel", "op"],
    stressed: 1,
    ok: "wiː nˈiːd tə dɪvˈɛləp ɐ bˈɛɾɚ plˈæn",
    stress: { ipa: "wiː nˈiːd tə dˈɛvələp ɐ bˈɛɾɚ plˈæn", stressed: 0 },
    schwa: "wiː nˈiːd tə dɪvˈɛlɔp ɐ bˈɛɾɚ plˈæn",
  },
  {
    key: "photographer",
    text: "My sister is a photographer.",
    word: "photographer",
    syllables: ["pho", "tog", "ra", "pher"],
    stressed: 1,
    ok: "maɪ sˈɪstɚɹ ɪz ɐ fətˈɑːɡɹəfɚ",
    stress: { ipa: "maɪ sˈɪstɚɹ ɪz ɐ fˈoʊɾəɡɹæfɚ", stressed: 0 },
    schwa: "maɪ sˈɪstɚɹ ɪz ɐ foʊtˈɑːɡɹæfɛɹ",
  },
  {
    key: "comfortable",
    text: "This chair is very comfortable.",
    word: "comfortable",
    syllables: ["com", "for", "ta", "ble"],
    stressed: 0,
    ok: "ðɪs tʃˈɛɹ ɪz vˈɛɹi kˈʌmftəbəl",
    stress: { ipa: "ðɪs tʃˈɛɹ ɪz vˈɛɹi kʌmfɚtˈeɪbəl", stressed: 2 },
    schwa: "ðɪs tʃˈɛɹ ɪz vˈɛɹi kˈʌmfɔːɹtæbɛl",
  },
  {
    key: "banana",
    text: "I always eat a banana for breakfast.",
    word: "banana",
    syllables: ["ba", "na", "na"],
    stressed: 1,
    ok: "aɪ ˈɔːlweɪz ˈiːt ɐ bɐnˈænə fɔːɹ bɹˈɛkfəst",
    stress: { ipa: "aɪ ˈɔːlweɪz ˈiːt ɐ bˈænənə fɔːɹ bɹˈɛkfəst", stressed: 0 },
    schwa: "aɪ ˈɔːlweɪz ˈiːt ɐ bɑnˈænɑ fɔːɹ bɹˈɛkfəst",
  },
  {
    key: "hotel",
    text: "We stayed at a small hotel.",
    word: "hotel",
    syllables: ["ho", "tel"],
    stressed: 1,
    ok: "wiː stˈeɪd æɾə smˈɔːl hoʊtˈɛl",
    stress: { ipa: "wiː stˈeɪd æɾə smˈɔːl hˈoʊɾɛl", stressed: 0 },
  },
  {
    key: "record",
    text: "I bought a record yesterday.",
    word: "record",
    syllables: ["rec", "ord"],
    stressed: 0,
    ok: "aɪ bˈɔːt ɐ ɹˈɛkɚd jˈɛstɚdˌeɪ",
    // The verb's stress: it changes the meaning.
    stress: { ipa: "aɪ bˈɔːt ɐ ɹɪkˈɔːɹd jˈɛstɚdˌeɪ", stressed: 1 },
  },
  {
    key: "present",
    text: "It is a present for you.",
    word: "present",
    syllables: ["pres", "ent"],
    stressed: 0,
    ok: "ɪɾ ɪz ɐ pɹˈɛzənt fɔːɹ juː",
    stress: { ipa: "ɪɾ ɪz ɐ pɹɪzˈɛnt fɔːɹ juː", stressed: 1 },
    schwa: "ɪɾ ɪz ɐ pɹˈɛzɛnt fɔːɹ juː",
  },
  {
    key: "computer",
    text: "The computer is on the table.",
    word: "computer",
    syllables: ["com", "pu", "ter"],
    stressed: 1,
    ok: "ðə kəmpjˈuːɾɚɹ ɪz ɔnðə tˈeɪbəl",
    stress: { ipa: "ðə kˈɑːmpjuːɾɚɹ ɪz ɔnðə tˈeɪbəl", stressed: 0 },
    schwa: "ðə kɔmpjˈuːtɛɹ ɪz ɔnðə tˈeɪbəl",
  },
  {
    key: "vegetables",
    text: "Eat more vegetables every day.",
    word: "vegetables",
    syllables: ["veg", "e", "ta", "bles"],
    stressed: 0,
    ok: "ˈiːt mˈoːɹ vˈɛdʒtəbəlz ˈɛvɹi dˈeɪ",
    stress: { ipa: "ˈiːt mˈoːɹ vɛdʒɪtˈeɪbəlz ˈɛvɹi dˈeɪ", stressed: 2 },
    schwa: "ˈiːt mˈoːɹ vˈɛdʒɛteɪbɛlz ˈɛvɹi dˈeɪ",
  },
  {
    key: "to",
    // Weak forms: "to" and "the" said as /tuː/ and /ðiː/ everywhere.
    text: "I want to go to the doctor.",
    word: "to",
    syllables: ["to"],
    stressed: 0,
    ok: "aɪ wˈɔnt tə ɡˈoʊ tə ðə dˈɑːktɚ",
    schwa: "aɪ wˈɔnt tˈuː ɡˈoʊ tˈuː ðˈiː dˈɑːktɔːɹ",
  },
];

/** Whole sentences read with several typical Spanish-speaker errors at once. */
const ACCENT: { key: string; text: string; ok: string; accent: string; expected: SpikeCategory[] }[] = [
  {
    key: "student",
    text: "I think this is a very good student.",
    ok: "aɪ θˈɪŋk ðɪs ɪz ɐ vˈɛɹi ɡˈʊd stˈuːdənt",
    accent: "aɪ tˈiŋk dis is a bˈeɾi ɡˈud estˈudent",
    expected: ["th_sounds", "b_v", "initial_s_cluster", "vowel_length", "schwa_reduction"],
  },
  {
    key: "table",
    text: "The computer is on the table.",
    ok: "ðə kəmpjˈuːɾɚɹ ɪz ɔnðə tˈeɪbəl",
    accent: "de kɔmpˈuteɾ is ɔn de tˈeβel",
    expected: ["th_sounds", "schwa_reduction", "vowel_quality"],
  },
  {
    key: "plan",
    text: "We need to develop a better plan.",
    ok: "wiː nˈiːd tə dɪvˈɛləp ɐ bˈɛɾɚ plˈæn",
    accent: "wiː nˈid tˈu dˈevelɔp a bˈeteɾ plˈan",
    expected: ["word_stress", "schwa_reduction", "vowel_quality", "vowel_length"],
  },
];

export const CLIPS: Clip[] = [
  ...ITEMS.flatMap((item): Clip[] => {
    const base = { text: item.text, word: item.word, syllables: item.syllables };
    const clips: Clip[] = [
      {
        ...base,
        id: `${item.key}-ok`,
        variant: "ok",
        ipa: item.ok,
        expected: [],
        stressed: item.stressed,
        reduced: true,
      },
    ];
    if (item.stress) {
      clips.push({
        ...base,
        id: `${item.key}-stress`,
        variant: "stress",
        ipa: item.stress.ipa,
        expected: ["word_stress"],
        stressed: item.stress.stressed,
        reduced: true,
      });
    }
    if (item.schwa) {
      clips.push({
        ...base,
        id: `${item.key}-schwa`,
        variant: "schwa",
        ipa: item.schwa,
        expected: ["schwa_reduction"],
        stressed: item.stressed,
        reduced: false,
      });
    }
    return clips;
  }),
  ...ACCENT.flatMap((a): Clip[] => [
    { id: `${a.key}-accent-ok`, text: a.text, word: "", variant: "ok", ipa: a.ok, expected: [] },
    { id: `${a.key}-accent`, text: a.text, word: "", variant: "accent", ipa: a.accent, expected: a.expected },
  ]),
];

/** Kokoro voices to read the set with (American, one female and one male). */
export const VOICES = ["af_heart", "am_michael"] as const;

export const SPIKE_DIR = "data/pron-audio-spike";
