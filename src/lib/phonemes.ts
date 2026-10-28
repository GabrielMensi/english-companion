import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { AutoModelForCTC, AutoProcessor, Tensor } from "@huggingface/transformers";
import { serverEnv } from "@/lib/env";
import { analyzePhonemes, decodeCtc, type PhonemeCheckResult, PHONEME_MODEL_ID, parseWav } from "@/lib/phonemes-core";
import { cmuLookup } from "@/lib/cmu-lookup";
import type { PronunciationCategory } from "@/lib/taxonomy";

/**
 * The read-aloud sound check (beta): wav2vec2 phonemes on the server's CPU through transformers.js.
 * The model (~320 MB) is downloaded the first time it's needed, in the background, and kept in
 * PHONEME_MODEL_DIR; until it's ready (or if it can't be loaded) the check answers with a status
 * and the transcript-based check keeps working on its own. See docs/voice/PRONUNCIATION_AUDIO.md.
 */

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForCTC.from_pretrained>>;
  idToToken: Record<number, string>;
};

type State =
  | { kind: "idle" }
  | { kind: "loading"; progress: number | null; promise: Promise<void> }
  | { kind: "ready"; loaded: Loaded }
  | { kind: "failed"; reason: string; at: number };

/** After a failed load, wait this long before trying (and downloading) again. */
const RETRY_AFTER_MS = 5 * 60 * 1000;
/** Longer recordings aren't checked: a sentence takes seconds, and this bounds the inference time. */
const MAX_SECONDS = 60;
const SAMPLE_RATE = 16_000;

const g = globalThis as { __phonemeState?: State; __phonemeQueue?: Promise<unknown> };
const getState = (): State => (g.__phonemeState ??= { kind: "idle" });
const setState = (state: State) => {
  g.__phonemeState = state;
};

async function load(): Promise<Loaded> {
  const { AutoModelForCTC, AutoProcessor, env } = await import("@huggingface/transformers");
  const dir = path.resolve(serverEnv().PHONEME_MODEL_DIR);
  fs.mkdirSync(dir, { recursive: true });
  env.cacheDir = dir;

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress" || !info.file || !info.total) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
    const all = [...files.values()];
    const state = getState();
    if (state.kind === "loading") {
      state.progress = all.reduce((s, f) => s + f.loaded, 0) / all.reduce((s, f) => s + f.total, 0);
    }
  };

  const processor = await AutoProcessor.from_pretrained(PHONEME_MODEL_ID, { progress_callback });
  const model = await AutoModelForCTC.from_pretrained(PHONEME_MODEL_ID, {
    dtype: "q8",
    device: "cpu",
    progress_callback,
  });

  // transformers.js has no tokenizer for this model: the vocabulary is decoded by hand.
  const vocabFile = path.join(dir, "wav2vec2-lv-60-espeak-cv-ft-vocab.json");
  if (!fs.existsSync(vocabFile)) {
    const res = await fetch(`https://huggingface.co/${PHONEME_MODEL_ID}/resolve/main/vocab.json`);
    if (!res.ok) throw new Error(`vocabulary download failed (${res.status})`);
    fs.writeFileSync(vocabFile, await res.text());
  }
  const vocab = JSON.parse(fs.readFileSync(vocabFile, "utf8")) as Record<string, number>;
  const idToToken = Object.fromEntries(Object.entries(vocab).map(([token, id]) => [id, token]));
  return { processor, model, idToToken };
}

function startLoading(): State {
  const state: State = {
    kind: "loading",
    progress: null,
    promise: load().then(
      (loaded) => setState({ kind: "ready", loaded }),
      (error: unknown) => {
        console.error("Phoneme model could not be loaded:", error instanceof Error ? error.message : error);
        setState({ kind: "failed", reason: "The sound-check model couldn't be loaded.", at: Date.now() });
      },
    ),
  };
  setState(state);
  return state;
}

/** Runs the model one recording at a time (the CPU is shared with the rest of the app). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (g.__phonemeQueue ?? Promise.resolve()).then(job, job);
  g.__phonemeQueue = run.catch(() => undefined);
  return run;
}

async function recognize(loaded: Loaded, samples: Float32Array) {
  const inputs = await loaded.processor(samples);
  const { logits } = (await loaded.model(inputs)) as { logits: Tensor };
  const [, frames, classes] = logits.dims;
  return decodeCtc(logits.data as Float32Array, frames, classes, loaded.idToToken);
}

/**
 * Checks a reading's recording against its sentence. Never throws: whatever goes wrong comes back
 * as `unavailable`, so the read-aloud result doesn't depend on it.
 */
export async function checkPhonemes(
  wav: Uint8Array,
  text: string,
  issues: { expected: string; category: PronunciationCategory }[],
): Promise<PhonemeCheckResult> {
  if (!serverEnv().PHONEME_CHECK) return { status: "unavailable", reason: "The sound check is turned off." };

  let state = getState();
  if (state.kind === "failed") {
    if (Date.now() - state.at < RETRY_AFTER_MS) return { status: "unavailable", reason: state.reason };
    state = startLoading();
  } else if (state.kind === "idle") {
    state = startLoading();
  }
  if (state.kind === "loading") return { status: "preparing", progress: state.progress };
  if (state.kind !== "ready") return { status: "unavailable", reason: "The sound check isn't ready." };

  const audio = parseWav(wav);
  if (!audio || audio.sampleRate !== SAMPLE_RATE) {
    return { status: "unavailable", reason: "The recording isn't a 16 kHz mono WAV." };
  }
  if (audio.samples.length > MAX_SECONDS * SAMPLE_RATE) {
    return { status: "unavailable", reason: "The recording is too long for the sound check." };
  }

  const { loaded } = state;
  try {
    const started = Date.now();
    const heard = await enqueue(() => recognize(loaded, audio.samples));
    const analysis = analyzePhonemes(text, issues, heard, cmuLookup);
    return { status: "ready", analysis, ms: Date.now() - started };
  } catch (error) {
    console.error("Sound check failed:", error instanceof Error ? error.message : error);
    return { status: "unavailable", reason: "The sound check failed on this recording." };
  }
}
