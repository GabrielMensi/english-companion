/**
 * SPIKE (#74): reads the synthetic test set with Kokoro on the CPU and saves
 * 16 kHz mono WAVs (the format the app records) to data/pron-audio-spike/.
 *
 *   pnpm tsx scripts/spike/pron-audio/synth.mts
 */
import fs from "node:fs";
import path from "node:path";
import { KokoroTTS } from "kokoro-js";
import { encodeWav, resample, SPEECH_SAMPLE_RATE } from "../../../src/lib/audio/wav";
import { CLIPS, SPIKE_DIR, VOICES } from "./clips";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
fs.mkdirSync(SPIKE_DIR, { recursive: true });

for (const voice of VOICES) {
  for (const clip of CLIPS) {
    // The tokenizer maps IPA characters to ids, skipping Kokoro's own phonemizer.
    const { input_ids } = tts.tokenizer(clip.ipa, { truncation: true });
    const audio = await tts.generate_from_ids(input_ids, { voice });
    const samples = resample(audio.audio, audio.sampling_rate, SPEECH_SAMPLE_RATE);
    const file = path.join(SPIKE_DIR, `${voice}--${clip.id}.wav`);
    fs.writeFileSync(file, Buffer.from(encodeWav(samples, SPEECH_SAMPLE_RATE)));
    console.log(`${file}  ${(samples.length / SPEECH_SAMPLE_RATE).toFixed(1)} s  /${clip.ipa}/`);
  }
}
