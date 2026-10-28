/**
 * SPIKE (#74, #134, #136): loads the wav2vec2 phoneme recognizer for the scripts here
 * (the app loads it in src/lib/phonemes.ts, with a status for the UI).
 */
import fs from "node:fs";
import path from "node:path";
import { AutoModelForCTC, AutoProcessor, type Tensor } from "@huggingface/transformers";
import { decodeCtc, type HeardPhone, PHONEME_MODEL_ID } from "../../../src/lib/phonemes-core";

export async function loadRecognizer(dtype: "fp32" | "q8" | "q4" = "q8", cacheDir = "data/pron-audio-spike") {
  const started = Date.now();
  const processor = await AutoProcessor.from_pretrained(PHONEME_MODEL_ID);
  const model = await AutoModelForCTC.from_pretrained(PHONEME_MODEL_ID, { dtype, device: "cpu" });
  // transformers.js has no Wav2Vec2PhonemeCTCTokenizer: decode with the vocabulary by hand.
  const vocabFile = path.join(cacheDir, "wav2vec2-vocab.json");
  if (!fs.existsSync(vocabFile)) {
    const res = await fetch(`https://huggingface.co/${PHONEME_MODEL_ID}/resolve/main/vocab.json`);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(vocabFile, await res.text());
  }
  const vocab = JSON.parse(fs.readFileSync(vocabFile, "utf8")) as Record<string, number>;
  const idToToken = Object.fromEntries(Object.entries(vocab).map(([t, id]) => [id, t]));
  console.log(`Loaded ${PHONEME_MODEL_ID} (${dtype}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  return {
    /** The vocabulary without special tokens, to tokenize IPA with. */
    phonemeSet: new Set(Object.keys(vocab).filter((t) => !t.startsWith("<"))),
    async recognize(samples: Float32Array): Promise<HeardPhone[]> {
      const inputs = await processor(samples);
      const { logits } = (await model(inputs)) as { logits: Tensor };
      const [, frames, classes] = logits.dims;
      return decodeCtc(logits.data as Float32Array, frames, classes, idToToken);
    },
  };
}
