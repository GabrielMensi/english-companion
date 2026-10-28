/// <reference lib="webworker" />
/**
 * Runs Kokoro-82M (kokoro-js on transformers.js / ONNX Runtime Web) off the main thread, so
 * synthesizing never freezes the UI. Started lazily by `kokoro.ts` the first time Kokoro is used,
 * and restarted when the device setting changes.
 */
import { env as transformersEnv } from "@huggingface/transformers";
import { env, KokoroTTS, TextSplitterStream } from "kokoro-js";
import { checkSpeechAudio } from "./audio-check";
import { speechChunks } from "./speech-chunks";
import type { GpuAdapterDetails, KokoroDiagnostics, TestResult } from "./kokoro-diagnostics";
import type { KokoroConfig, KokoroDevice, KokoroDtype, KokoroRequest, KokoroResponse } from "./kokoro";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Synthesized once after loading, and its audio checked, to prove the device really works. */
const TEST_SENTENCE = "Hello, this is a quick test.";
/** Kokoro always produces 24 kHz audio; the page plays it in an AudioBuffer at this rate. */
const SAMPLE_RATE = 24000;

// ONNX Runtime's WASM files are served by the app itself (instead of a CDN), so nothing but the
// model weights is ever downloaded, and those only once.
env.wasmPaths = new URL("/api/tts/runtime/", self.location.origin).href;

declare const self: DedicatedWorkerGlobalScope;

function post(message: KokoroResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

interface Engine {
  tts: KokoroTTS;
  device: KokoroDevice;
  dtype: KokoroDtype;
}

let config: KokoroConfig = { device: "auto", gpuRejection: null, simulateNoise: null, threads: 1 };
let loading: Promise<Engine> | null = null;
/** The request being synthesized; a newer request or a cancel makes the older one stop between sentences. */
let current = 0;
/** GPU name, for Settings (null when there's no WebGPU adapter). */
let adapterName: string | null = null;
/** What this worker learned, for the "Copy diagnostics" button in Settings. */
const diagnostics: KokoroDiagnostics = { adapter: null, onnxRuntime: null, tests: [] };

/** Adds up the download progress of every model file. */
function progressTracker(device: KokoroDevice, dtype: KokoroDtype) {
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
    post({ type: "progress", device, dtype, loaded, total });
  };
}

interface GpuAdapter {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string };
  isFallbackAdapter?: boolean;
  features?: { has(feature: string): boolean };
}

/** Whether there's a WebGPU adapter; also records its name for Settings. */
async function hasWebGpu() {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    if (!adapter) return false;
    const info = adapter.info;
    adapterName = info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || null : null;
    const details: GpuAdapterDetails = {
      vendor: info?.vendor || null,
      architecture: info?.architecture || null,
      device: info?.device || null,
      description: info?.description || null,
      isFallbackAdapter: (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter ?? null,
      shaderF16: adapter.features?.has("shader-f16") ?? false,
    };
    diagnostics.adapter = details;
    return true;
  } catch {
    return false;
  }
}

/**
 * Synthesizes one sentence. `simulateNoise` (development only) swaps the result for white noise:
 * "webgpu-speech" only after the test sentence, to exercise the per-sentence check.
 */
async function synth(engine: Engine, text: string, voice: string, speed: number, test = false): Promise<Float32Array> {
  const { audio } = await engine.tts.generate(text, { voice: voice as never, speed });
  const noise = config.simulateNoise;
  if (
    noise === engine.device ||
    noise === "all" ||
    (noise === "webgpu-speech" && engine.device === "webgpu" && !test)
  ) {
    return Float32Array.from(audio, () => (Math.random() * 2 - 1) * 0.3);
  }
  return audio;
}

const DEVICE_NAME: Record<KokoroDevice, string> = { webgpu: "GPU (WebGPU)", wasm: "CPU (WebAssembly)" };

/**
 * Loads the model on the device the setting asks for:
 * - auto: WebGPU at fp32 when there's a GPU and it hasn't failed the audio check in this browser,
 *   else WASM. If the GPU's test audio fails the check (noise, NaN…), it's rejected (and
 *   remembered by the page) and the CPU takes over.
 * - webgpu: forced, even if its audio fails the check (Settings shows the failure). Only an error
 *   loading it falls back to the CPU.
 * - wasm: forced.
 * fp32 on WebGPU: the fp16/quantized models are worse there (NaNs with fp16, garbage with q8/q4,
 * see docs/voice/VOICE.md). On WASM, fp32 when there are threads: ONNX Runtime parallelizes it well (real-time
 * factor ~0.5 with 8 threads, vs ~1.0 for q8, whose quantized ops barely gain from threads), and
 * it's the same file the GPU uses. With a single thread (page not isolated) both take ~1.6× the
 * audio's length, so the 8-bit model wins by being 92 MB instead of 326 MB.
 */
async function load(): Promise<Engine> {
  // WASM threads only work when the page is cross-origin isolated (see next.config.ts); without
  // it ONNX Runtime falls back to one thread whatever this says.
  const threads = self.crossOriginIsolated ? config.threads : 1;
  const wasm = transformersEnv.backends.onnx.wasm;
  if (wasm) wasm.numThreads = threads;
  diagnostics.onnxRuntime = (transformersEnv.backends.onnx as { versions?: { web?: string } }).versions?.web ?? null;
  diagnostics.tests = [];
  const gpu = config.device !== "wasm" && (await hasWebGpu());
  const tryGpu = gpu && (config.device === "webgpu" || !config.gpuRejection);
  const attempts: { device: KokoroDevice; dtype: KokoroDtype }[] = [];
  if (tryGpu) attempts.push({ device: "webgpu", dtype: "fp32" });
  attempts.push({ device: "wasm", dtype: threads > 1 ? "fp32" : "q8" });

  let warning: string | null = null;
  if (config.device === "webgpu" && !gpu) warning = "This browser has no WebGPU adapter, so Kokoro runs on the CPU.";
  if (config.device === "auto" && gpu && config.gpuRejection) {
    warning = `The GPU failed the audio check earlier in this browser (${config.gpuRejection.reason}), so Kokoro runs on the CPU.`;
  }

  let lastError: unknown;
  for (const { device, dtype } of attempts) {
    let tts: KokoroTTS | null = null;
    try {
      post({ type: "progress", device, dtype, loaded: 0, total: 0 });
      const started = performance.now();
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype,
        device,
        progress_callback: progressTracker(device, dtype),
      });
      const loaded = performance.now();
      const engine: Engine = { tts, device, dtype };
      const test = await synth(engine, TEST_SENTENCE, "af_heart", 1, true);
      const check = checkSpeechAudio(test);
      const result: TestResult = {
        device,
        dtype,
        ok: check.ok,
        reason: check.ok ? null : check.reason,
        metrics: check.metrics,
      };
      diagnostics.tests.push(result);
      console.debug(
        `[kokoro] ${device}/${dtype}${device === "wasm" ? `, ${threads} thread(s)` : ""}: model ${secs(loaded - started)}, ` +
          `test sentence ${secs(performance.now() - loaded)} for ${secs((test.length / SAMPLE_RATE) * 1000)} of audio`,
      );
      if (!check.ok) {
        const message = `Kokoro's test audio on the ${DEVICE_NAME[device]} failed the check: ${check.reason}`;
        console.warn(message, check.metrics);
        if (device === "webgpu" && config.device === "auto") {
          rejectGpu(check.reason);
          warning = `The GPU's audio failed the check (${check.reason}), so Kokoro switched to the CPU.`;
          await dispose(tts);
          continue;
        }
        if (device === "webgpu")
          warning = `The GPU's test audio failed the check (${check.reason}): it may sound like noise.`;
        else throw new Error(message);
      }
      post({
        type: "ready",
        device,
        dtype,
        adapter: device === "webgpu" ? adapterName : null,
        threads: device === "wasm" ? threads : null,
        warning,
        diagnostics: structuredClone(diagnostics),
      });
      return engine;
    } catch (error) {
      console.warn(`Kokoro couldn't run on ${device}`, error);
      if (tts) await dispose(tts);
      lastError = error;
      if (device === "webgpu")
        warning = `Kokoro couldn't run on the GPU (${errorMessage(error)}), so it runs on the CPU.`;
    }
  }
  throw lastError;
}

/** WebGPU's audio failed the check in auto mode: remember it here and in the page (see kokoro.ts). */
function rejectGpu(reason: string) {
  const rejection = { reason, at: new Date().toISOString() };
  config = { ...config, gpuRejection: rejection };
  post({ type: "gpu-rejected", ...rejection });
}

async function dispose(tts: KokoroTTS) {
  try {
    await tts.model.dispose();
  } catch {
    // Already gone; nothing else holds it.
  }
}

function ensureLoaded() {
  loading ??= load().catch((error: unknown) => {
    loading = null;
    post({ type: "error", message: errorMessage(error) });
    throw error;
  });
  return loading;
}

function secs(ms: number) {
  return `${(ms / 1000).toFixed(2)} s`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function speak({ id, text, voice, speed }: Extract<KokoroRequest, { type: "speak" }>) {
  current = id;
  try {
    await ensureLoaded();
  } catch {
    return; // Already reported by ensureLoaded.
  }
  try {
    // Chunk by chunk (sentences, with the first one cut at a clause so it's short), so the first
    // one plays while the next ones are synthesized: the queue runs ahead of playback as far as
    // synthesis allows. The splitter is closed by hand: given a plain string, kokoro-js's `stream`
    // never yields the last sentence.
    const splitter = new TextSplitterStream();
    splitter.push(text);
    splitter.close();
    const sentences: string[] = [];
    for await (const sentence of splitter) sentences.push(sentence);
    const chunks = speechChunks(sentences);
    for (const [index, chunk] of chunks.entries()) {
      if (current !== id) return;
      let engine = await ensureLoaded();
      const started = performance.now();
      let samples = await synth(engine, chunk, voice, speed);
      if (engine.device === "webgpu") {
        // The GPU passed the test sentence, but its bugs can depend on the input: check every one.
        const check = checkSpeechAudio(samples);
        if (!check.ok && check.kind !== "silent") {
          console.warn(`Kokoro's GPU audio failed the check: ${check.reason}`, check.metrics);
          if (config.device === "auto") {
            await dispose(engine.tts);
            rejectGpu(check.reason);
            loading = null;
            engine = await ensureLoaded(); // Now on the CPU.
            samples = await synth(engine, chunk, voice, speed);
          } else {
            post({ type: "warning", message: `The GPU's audio failed the check (${check.reason}).` });
          }
        }
      }
      const took = performance.now() - started;
      const duration = (samples.length / SAMPLE_RATE) * 1000;
      console.debug(
        `[kokoro] chunk ${index + 1}/${chunks.length} on ${engine.device}: ${secs(took)} for ${secs(duration)} of audio ` +
          `(real-time factor ${(took / duration).toFixed(2)})`,
      );
      if (current !== id) return;
      // `generate` returns a fresh array per chunk; copy anyway, so the transferred buffer holds
      // exactly these samples (never a view into something bigger).
      const copy = samples.slice();
      post({ type: "chunk", id, samples: copy, sampleRate: SAMPLE_RATE, device: engine.device }, [copy.buffer]);
    }
    if (current === id) post({ type: "done", id });
  } catch (error) {
    if (current === id) post({ type: "failed", id, message: errorMessage(error) });
  }
}

self.addEventListener("message", (event: MessageEvent<KokoroRequest>) => {
  const request = event.data;
  if (request.type === "configure") config = request.config;
  else if (request.type === "load") ensureLoaded().catch(() => {});
  else if (request.type === "speak") void speak(request);
  else if (request.type === "cancel" && current === request.id) current = 0;
});
