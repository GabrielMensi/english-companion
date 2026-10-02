/// <reference lib="webworker" />
/**
 * Runs Kokoro-82M (kokoro-js on transformers.js / ONNX Runtime Web) off the main thread, so
 * synthesizing never freezes the UI. Started lazily by `kokoro.ts` the first time Kokoro is used.
 */
import { env, KokoroTTS, TextSplitterStream } from "kokoro-js";
import type { KokoroDevice, KokoroRequest, KokoroResponse } from "./kokoro";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// ONNX Runtime's WASM files are served by the app itself (instead of a CDN), so nothing but the
// model weights is ever downloaded, and those only once.
env.wasmPaths = new URL("/api/tts/runtime/", self.location.origin).href;

declare const self: DedicatedWorkerGlobalScope;

function post(message: KokoroResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

let loading: Promise<KokoroTTS> | null = null;
/** The request being synthesized; a newer request or a cancel makes the older one stop between sentences. */
let current = 0;

/** Adds up the download progress of every model file. */
function progressTracker() {
  const files = new Map<string, { loaded: number; total: number }>();
  return (event: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== "progress" || !event.file) return;
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: "progress", loaded, total });
  };
}

async function hasWebGpu() {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/**
 * WebGPU with full precision when there's a GPU (the quantized models sound wrong on WebGPU),
 * else WASM with the 8-bit model. A short warm-up checks that the device really works.
 */
async function load(): Promise<KokoroTTS> {
  const attempts: { device: KokoroDevice; dtype: "fp32" | "q8" }[] = [];
  if (await hasWebGpu()) attempts.push({ device: "webgpu", dtype: "fp32" });
  attempts.push({ device: "wasm", dtype: "q8" });

  let lastError: unknown;
  for (const { device, dtype } of attempts) {
    try {
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device, progress_callback: progressTracker() });
      await tts.generate("Hi.", { voice: "af_heart" });
      post({ type: "ready", device });
      return tts;
    } catch (error) {
      console.warn(`Kokoro couldn't run on ${device}`, error);
      lastError = error;
    }
  }
  throw lastError;
}

function ensureLoaded() {
  loading ??= load().catch((error: unknown) => {
    loading = null;
    post({ type: "error", message: errorMessage(error) });
    throw error;
  });
  return loading;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function speak({ id, text, voice, speed }: Extract<KokoroRequest, { type: "speak" }>) {
  current = id;
  let tts: KokoroTTS;
  try {
    tts = await ensureLoaded();
  } catch {
    return; // Already reported by ensureLoaded.
  }
  try {
    // Sentence by sentence, so the first one plays while the next ones are synthesized. The splitter
    // is closed by hand: given a plain string, `stream` never yields the last sentence.
    const sentences = new TextSplitterStream();
    sentences.push(text);
    sentences.close();
    for await (const { audio } of tts.stream(sentences, { voice: voice as never, speed })) {
      if (current !== id) return;
      // A copy, so the transferred buffer holds just this sentence.
      const samples = audio.audio.slice();
      post({ type: "chunk", id, samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
    }
    if (current === id) post({ type: "done", id });
  } catch (error) {
    if (current === id) post({ type: "failed", id, message: errorMessage(error) });
  }
}

self.addEventListener("message", (event: MessageEvent<KokoroRequest>) => {
  const request = event.data;
  if (request.type === "load") ensureLoaded().catch(() => {});
  else if (request.type === "speak") void speak(request);
  else if (request.type === "cancel" && current === request.id) current = 0;
});
