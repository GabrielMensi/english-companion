/**
 * SPIKE (#74): a wav2vec2 phoneme recognizer on the CPU, through
 * transformers.js (no Python, no GPU). For each clip it measures:
 * - whether the recognizer hears what the clip says (PER against the clip's own
 *   IPA and against the correct IPA): a sanity check of the synthetic set;
 * - schwa: the reduced vowels (ə, ɚ, ɐ) of the correct pronunciation of the
 *   word, and whether the recognizer heard a full vowel in their place;
 * - stress (heuristic): the vowel of the word with the most loudness + pitch +
 *   length, compared with the vowel the clip stresses.
 *
 *   pnpm tsx scripts/spike/pron-audio/phonemes.mts [--dtype=q8] [--dir=data/pron-audio-spike]
 */
import fs from "node:fs";
import path from "node:path";
import { align, isVowel, per, prosody, readWav, REDUCED, tokenizeIpa } from "./audio";
import { CLIPS, SPIKE_DIR, VOICES } from "./clips";
import { loadRecognizer } from "./model";
import { type StressScorer, STRESS_SCORERS, stressGuesses, vowelFeatures } from "./stress";

const args = process.argv.slice(2);
const dtype = (args.find((a) => a.startsWith("--dtype="))?.split("=")[1] ?? "q8") as "fp32" | "q8" | "q4";
const dir = args.find((a) => a.startsWith("--dir="))?.split("=")[1] ?? SPIKE_DIR;

const { phonemeSet, recognize } = await loadRecognizer(dtype);
const MODEL_ID = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";

const rows: Record<string, string | number | boolean>[] = [];
const times: number[] = [];

for (const voice of VOICES) {
  for (const clip of CLIPS) {
    const file = path.join(dir, `${voice}--${clip.id}.wav`);
    if (!fs.existsSync(file)) continue;
    const { samples, sampleRate } = readWav(file);
    const started = Date.now();
    const heard = await recognize(samples);
    times.push(Date.now() - started);
    const heardTokens = heard.map((h) => h.token);

    const okIpa = CLIPS.find(
      (c) => c.id === clip.id.replace(/-(stress|schwa|accent)$/, clip.variant === "accent" ? "-accent-ok" : "-ok"),
    )!.ipa;
    const said = tokenizeIpa(clip.ipa, phonemeSet);
    const canonical = tokenizeIpa(okIpa, phonemeSet);

    // Schwa: reduced vowels of the correct pronunciation heard as full vowels.
    // Whole sentence for accent clips, only the word otherwise.
    const words = clip.text.replace(/[.,?!]/g, "").split(" ");
    // Every occurrence counts ("to" appears twice); stress looks at the first one.
    const wordIndexes = clip.word ? words.flatMap((w, i) => (w === clip.word ? [i] : [])) : [];
    const wordIndex = wordIndexes[0] ?? -1;
    const toCanonical = align(
      canonical.map((t) => t.token),
      heardTokens,
    );
    const reducedSlots = canonical
      .map((t, i) => ({ ...t, heard: toCanonical[i] >= 0 ? heardTokens[toCanonical[i]] : "∅" }))
      .filter((t) => REDUCED.has(t.token) && (wordIndex < 0 || wordIndexes.includes(t.word)));
    const fullVowels = reducedSlots.filter((t) => isVowel(t.heard) && !REDUCED.has(t.heard) && t.heard !== "ɪ");

    // Stress: prominence of each vowel of the word, located through the clip's own IPA.
    let stressGuess: Record<StressScorer, number> | null = null;
    let stressTruth: number | null = null;
    if (clip.word && clip.word !== "to") {
      const toSaid = align(
        said.map((t) => t.token),
        heardTokens,
      );
      const vowels = said
        .map((t, i) => ({ ...t, h: toSaid[i] >= 0 ? heard[toSaid[i]] : null }))
        .filter((t) => t.word === wordIndex && isVowel(t.token));
      stressTruth = vowels.findIndex((v) => v.stressed);
      const found = vowels.filter((v) => v.h);
      if (found.length === vowels.length && vowels.length > 1) {
        stressGuess = stressGuesses(
          vowelFeatures(
            prosody(samples, sampleRate),
            found.map((v) => v.h!),
          ),
        );
      }
    }

    rows.push({
      voice,
      clip: clip.id,
      variant: clip.variant,
      heard: heardTokens.join(""),
      perSaid: +per(
        said.map((t) => t.token),
        heardTokens,
      ).toFixed(2),
      perOk: +per(
        canonical.map((t) => t.token),
        heardTokens,
      ).toFixed(2),
      reducedSlots: reducedSlots.length,
      fullVowels: fullVowels.map((t) => `${t.token}→${t.heard}`).join(" "),
      schwaFlag: fullVowels.length > 0,
      stressTruth: stressTruth ?? "",
      stressGuess: stressGuess?.all ?? "",
      stressByScorer: stressGuess ? JSON.stringify(stressGuess) : "",
    });
  }
}

console.table(rows.map(({ heard, ...r }) => ({ ...r, heard: String(heard).slice(0, 34) })));

// Schwa detector: flagged on schwa/accent clips, quiet on correct ones.
const schwaRows = rows.filter((r) => r.variant === "schwa" || (r.variant === "accent" && Number(r.reducedSlots) > 0));
const okRows = rows.filter((r) => r.variant === "ok" && Number(r.reducedSlots) > 0);
const stressRows = rows.filter((r) => r.stressGuess !== "");
const stressBy = (variant: string, voice?: string) => {
  const subset = stressRows.filter((r) => r.variant === variant && (!voice || r.voice === voice));
  return `${subset.filter((r) => r.stressGuess === r.stressTruth).length}/${subset.length}`;
};
// Right verdict per feature set (loudness, pitch, length and their sums), per voice and clip kind.
const scorerAccuracy = Object.fromEntries(
  (Object.keys(STRESS_SCORERS) as StressScorer[]).map((name) => {
    const by = (variant: string, voice: string) => {
      const subset = stressRows.filter((r) => r.variant === variant && r.voice === voice);
      const right = subset.filter(
        (r) => (JSON.parse(String(r.stressByScorer)) as Record<string, number>)[name] === r.stressTruth,
      );
      return `${right.length}/${subset.length}`;
    };
    return [
      name,
      Object.fromEntries(
        VOICES.map((v) => [v, `stress ${by("stress", v)}, ok ${by("ok", v)}, schwa ${by("schwa", v)}`]),
      ),
    ];
  }),
);
const changed = rows.filter((r) => r.variant !== "ok" && r.perSaid !== r.perOk);
const summary = {
  model: `${MODEL_ID} (${dtype})`,
  clips: rows.length,
  avgSecondsPerClip: +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2),
  realized: `${changed.filter((r) => Number(r.perSaid) < Number(r.perOk)).length}/${changed.length} clips with changed sounds heard closer to what they say than to the correct IPA`,
  schwaRecall: `${schwaRows.filter((r) => r.schwaFlag).length}/${schwaRows.length}`,
  schwaFalseAlarms: `${okRows.filter((r) => r.schwaFlag).length}/${okRows.length}`,
  // Right verdict = the most prominent vowel is the one the clip stresses.
  stressFound: Object.fromEntries(VOICES.map((v) => [v, stressBy("stress", v)])),
  stressRightOnCorrect: Object.fromEntries(VOICES.map((v) => [v, stressBy("ok", v)])),
  stressRightOnSchwa: Object.fromEntries(VOICES.map((v) => [v, stressBy("schwa", v)])),
  stressByFeature: scorerAccuracy,
  alwaysFirstSyllableBaseline: `${stressRows.filter((r) => r.stressTruth === 0).length}/${stressRows.length}`,
};
console.log(summary);

const outDir = path.resolve(".eval-results");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `pron-phonemes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), out)}`);
