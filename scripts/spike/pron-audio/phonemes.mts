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
import { AutoModelForCTC, AutoProcessor, type Tensor } from "@huggingface/transformers";
import { align, isVowel, per, prosody, readWav, REDUCED, tokenizeIpa } from "./audio";
import { CLIPS, SPIKE_DIR, VOICES } from "./clips";

const MODEL_ID = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
const args = process.argv.slice(2);
const dtype = (args.find((a) => a.startsWith("--dtype="))?.split("=")[1] ?? "q8") as "fp32" | "q8" | "q4";
const dir = args.find((a) => a.startsWith("--dir="))?.split("=")[1] ?? SPIKE_DIR;

const loadStarted = Date.now();
const processor = await AutoProcessor.from_pretrained(MODEL_ID);
const model = await AutoModelForCTC.from_pretrained(MODEL_ID, { dtype, device: "cpu" });
// transformers.js has no Wav2Vec2PhonemeCTCTokenizer: decode with the vocabulary by hand.
const vocabFile = path.join(SPIKE_DIR, "wav2vec2-vocab.json");
if (!fs.existsSync(vocabFile)) {
  const res = await fetch(`https://huggingface.co/${MODEL_ID}/resolve/main/vocab.json`);
  fs.writeFileSync(vocabFile, await res.text());
}
const vocab = JSON.parse(fs.readFileSync(vocabFile, "utf8")) as Record<string, number>;
const idToToken = Object.fromEntries(Object.entries(vocab).map(([t, id]) => [id, t]));
const phonemeSet = new Set(Object.keys(vocab).filter((t) => !t.startsWith("<")));
console.log(`Loaded ${MODEL_ID} (${dtype}) in ${((Date.now() - loadStarted) / 1000).toFixed(1)} s`);

/** Greedy CTC decoding that keeps the frames each phoneme spans. */
async function recognize(samples: Float32Array) {
  const inputs = await processor(samples);
  const { logits } = (await model(inputs)) as { logits: Tensor };
  const [, frames, classes] = logits.dims;
  const data = logits.data as Float32Array;
  const out: { token: string; start: number; end: number }[] = [];
  let prev = -1;
  for (let f = 0; f < frames; f++) {
    let best = 0;
    for (let c = 1; c < classes; c++) if (data[f * classes + c] > data[f * classes + best]) best = c;
    if (best !== 0 && best === prev) out[out.length - 1].end = f;
    else if (best !== 0) out.push({ token: idToToken[best], start: f, end: f });
    prev = best;
  }
  return out;
}

const zscores = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - mean) / sd);
};

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

    const okIpa = CLIPS.find((c) => c.id === clip.id.replace(/-(stress|schwa|accent)$/, clip.variant === "accent" ? "-accent-ok" : "-ok"))!.ipa;
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
    let stressGuess: number | null = null;
    let stressTruth: number | null = null;
    if (clip.word && clip.word !== "to") {
      const frames = prosody(samples, sampleRate);
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
        const features = found.map((v, i) => {
          const start = v.h!.start;
          const end = Math.min(found[i + 1]?.h!.start ?? v.h!.end + 4, v.h!.end + 6);
          const span = frames.slice(Math.max(start - 1, 0), end + 1);
          const voiced = span.filter((f) => f.f0 > 0).map((f) => f.f0);
          return {
            db: Math.max(...span.map((f) => f.db)),
            f0: voiced.length ? voiced.sort((a, b) => a - b)[Math.floor(voiced.length / 2)] : 0,
            length: end - start + 1,
          };
        });
        const [db, f0, length] = [zscores(features.map((f) => f.db)), zscores(features.map((f) => f.f0)), zscores(features.map((f) => f.length))];
        const score = features.map((_, i) => db[i] + f0[i] + length[i]);
        stressGuess = score.indexOf(Math.max(...score));
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
      stressGuess: stressGuess ?? "",
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
  alwaysFirstSyllableBaseline: `${stressRows.filter((r) => r.stressTruth === 0).length}/${stressRows.length}`,
};
console.log(summary);

const outDir = path.resolve(".eval-results");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `pron-phonemes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), out)}`);
