import "server-only";

import fs from "node:fs";
import path from "node:path";

import { cmuLookup } from "@/lib/cmu-lookup";
import { serverEnv } from "@/lib/env";
import {
  analyzePhonemes,
  decodeCtc,
  type PhonemeCheckResult,
  PHONEME_MODEL_ID,
  PHONEME_MODEL_REVISION,
  PHONEME_VOCAB_FILE,
  parseWav,
} from "@/lib/phonemes-core";
import type { PronunciationCategory } from "@/lib/taxonomy";

import type { AutoModelForCTC, AutoProcessor, Tensor } from "@huggingface/transformers";

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
const MAX_SECONDS = 30;
const SAMPLE_RATE = 16_000;

const g = globalThis as { __phonemeState?: State; __phonemeQueue?: Promise<unknown>; __phonemePending?: number };
const getState = (): State => (g.__phonemeState ??= { kind: "idle" });
const setState = (state: State) => {
  g.__phonemeState = state;
};

/** A download that takes longer than this counts as failed (the state would stay "preparing" forever). */
const LOAD_TIMEOUT_MS = 15 * 60 * 1000;

const modelDir = () => path.resolve(serverEnv().PHONEME_MODEL_DIR);

/** The vocabulary, downloaded once at the pinned revision; a bad body is never cached. */
async function loadVocab(dir: string): Promise<Record<string, number>> {
  const file = path.join(dir, PHONEME_VOCAB_FILE);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://huggingface.co/${PHONEME_MODEL_ID}/resolve/${PHONEME_MODEL_REVISION}/vocab.json`);
    if (!res.ok) throw new Error(`vocabulary download failed (${res.status})`);
    const text = await res.text();
    JSON.parse(text); // throws on anything but JSON
    fs.writeFileSync(`${file}.tmp`, text);
    fs.renameSync(`${file}.tmp`, file);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, number>;
}

async function load(): Promise<Loaded> {
  const { AutoModelForCTC, AutoProcessor, env } = await import("@huggingface/transformers");
  const dir = modelDir();
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

  const revision = PHONEME_MODEL_REVISION;
  const processor = await AutoProcessor.from_pretrained(PHONEME_MODEL_ID, { revision, progress_callback });
  const model = await AutoModelForCTC.from_pretrained(PHONEME_MODEL_ID, {
    revision,
    dtype: "q8",
    device: "cpu",
    // Don't keep the memory a long recording needed (the arena would hold on to it).
    session_options: { enableCpuMemArena: false },
    progress_callback,
  });

  const vocab = await loadVocab(dir);
  const idToToken = Object.fromEntries(Object.entries(vocab).map(([token, id]) => [id, token]));
  return { processor, model, idToToken };
}

/** Deletes the cached model and vocabulary, so the next try downloads them again (a truncated file would fail forever). */
function clearCache() {
  const dir = modelDir();
  fs.rmSync(path.join(dir, PHONEME_MODEL_ID), { recursive: true, force: true });
  fs.rmSync(path.join(dir, PHONEME_VOCAB_FILE), { force: true });
}

function startLoading(): State {
  const fail = (error: unknown) => {
    console.error("Phoneme model could not be loaded:", error instanceof Error ? error.message : error);
    // The cached files may be partial or corrupt: start clean on the next try.
    try {
      clearCache();
    } catch {
      // Nothing more to do; the doc says to delete the folder by hand.
    }
    setState({ kind: "failed", reason: "The sound-check model couldn't be loaded.", at: Date.now() });
  };
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("model load timed out")), LOAD_TIMEOUT_MS).unref(),
  );
  const state: State = {
    kind: "loading",
    progress: null,
    promise: Promise.race([load(), timeout]).then((loaded) => setState({ kind: "ready", loaded }), fail),
  };
  setState(state);
  return state;
}

/** At most this many recordings wait for or run in the model; more are answered "busy". */
const MAX_PENDING = 2;

/** Runs the model one recording at a time (the CPU is shared with the rest of the app). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  g.__phonemePending = (g.__phonemePending ?? 0) + 1;
  const run = (g.__phonemeQueue ?? Promise.resolve()).then(job, job);
  g.__phonemeQueue = run.then(
    () => void g.__phonemePending!--,
    () => void g.__phonemePending!--,
  );
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

  if ((g.__phonemePending ?? 0) >= MAX_PENDING) return { status: "unavailable", reason: "The sound check is busy." };
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
