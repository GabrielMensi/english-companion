"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { cacheKey } from "@/components/audio/audio-cache-core";
import { cachedInMemory, getCachedAudio, putCachedAudio } from "@/components/audio/audio-cache";
import type { KokoroDiagnostics } from "@/components/audio/kokoro-diagnostics";
import { type GpuRejection, type KokoroDevicePref, parseGpuRejection } from "@/components/audio/speech-prefs";

/**
 * Kokoro-82M text-to-speech, running in a Web Worker in this browser (see kokoro.worker.ts).
 * Nothing loads until Kokoro is first used: then the worker starts and the model is downloaded
 * once from Hugging Face and kept in the browser's Cache Storage.
 */

export type KokoroDevice = "webgpu" | "wasm";
export type KokoroDtype = "fp32" | "q8";

export interface KokoroConfig {
  device: KokoroDevicePref;
  /** The GPU's audio failed the check before in this browser: "auto" goes straight to the CPU. */
  gpuRejection: GpuRejection | null;
  /**
   * Development only: replace the output of this device with white noise, to test the fallback
   * ("webgpu-speech": the GPU passes the test sentence and fails on the real ones).
   */
  simulateNoise: KokoroDevice | "all" | "webgpu-speech" | null;
  /** WASM threads (used only when the page is cross-origin isolated). */
  threads: number;
}

export type KokoroRequest =
  | { type: "configure"; config: KokoroConfig }
  | { type: "load" }
  | { type: "speak"; id: number; text: string; voice: string; speed: number }
  | { type: "cancel"; id: number };

export type KokoroResponse =
  | { type: "progress"; device: KokoroDevice; dtype: KokoroDtype; loaded: number; total: number }
  | {
      type: "ready";
      device: KokoroDevice;
      dtype: KokoroDtype;
      adapter: string | null;
      threads: number | null;
      warning: string | null;
      diagnostics: KokoroDiagnostics;
    }
  /** The GPU's audio failed the check in auto mode; the worker is switching to the CPU. */
  | { type: "gpu-rejected"; reason: string; at: string }
  /** The GPU (forced in Settings) produced audio that failed the check. */
  | { type: "warning"; message: string }
  /** The model couldn't load: every pending request fails. */
  | { type: "error"; message: string }
  | { type: "chunk"; id: number; samples: Float32Array; sampleRate: number; device: KokoroDevice }
  | { type: "done"; id: number }
  | { type: "failed"; id: number; message: string };

export type KokoroStatus =
  | { state: "idle" }
  /** `progress` is 0–1 while downloading, null when it's unknown (e.g. loading from the cache). */
  | { state: "loading"; progress: number | null; device: KokoroDevice | null; dtype: KokoroDtype | null }
  | {
      state: "ready";
      device: KokoroDevice;
      dtype: KokoroDtype;
      /** GPU name when running on WebGPU (when the browser exposes it). */
      adapter: string | null;
      /** WASM threads in use (null on the GPU). */
      threads: number | null;
      /** Something to show next to the status: a fallback to the CPU or a failed audio check. */
      warning: string | null;
      diagnostics: KokoroDiagnostics;
    }
  | { state: "error"; message: string };

type OnChunk = (samples: Float32Array, sampleRate: number) => void;

interface Pending {
  onChunk: (samples: Float32Array, sampleRate: number, device: KokoroDevice) => void;
  /** All chunks arrived (not called when cancelled or failed). */
  onComplete: () => void;
  resolve: () => void;
  reject: (error: Error) => void;
}

const GPU_REJECTION_KEY = "kokoro-gpu-rejected";
/** Development only (set it in DevTools): "webgpu", "wasm", "all" or "webgpu-speech" turns output into noise. */
const SIMULATE_NOISE_KEY = "kokoro-simulate-noise";

let worker: Worker | null = null;
let status: KokoroStatus = { state: "idle" };
const statusListeners = new Set<() => void>();
const pending = new Map<number, Pending>();
let nextId = 1;
let readyWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];
let devicePref: KokoroDevicePref = "auto";
/** The device setting the running worker was started with. */
let workerDevice: KokoroDevicePref | null = null;

function setStatus(next: KokoroStatus) {
  status = next;
  statusListeners.forEach((l) => l());
}

export function kokoroSupported() {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof AudioContext !== "undefined";
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** When the GPU's audio failed the check in this browser (null if it never did, or after "Try the GPU again"). */
export function getGpuRejection(): GpuRejection | null {
  return parseGpuRejection(readStorage(GPU_REJECTION_KEY));
}

/**
 * WASM threads: ONNX Runtime's default is at most 4. Kokoro keeps speeding up to ~8 on a desktop
 * CPU; past that the gain is small and the rest of the machine (the browser) needs cores too.
 */
function wasmThreads() {
  const cores = typeof navigator === "undefined" ? 1 : navigator.hardwareConcurrency || 1;
  return Math.max(1, Math.min(8, Math.floor(cores / 2)));
}

function currentConfig(): KokoroConfig {
  const simulate = process.env.NODE_ENV === "production" ? null : readStorage(SIMULATE_NOISE_KEY);
  return {
    threads: wasmThreads(),
    device: devicePref,
    gpuRejection: getGpuRejection(),
    simulateNoise:
      simulate === "webgpu" || simulate === "wasm" || simulate === "all" || simulate === "webgpu-speech"
        ? simulate
        : null,
  };
}

/**
 * Sets where Kokoro runs. Only a different device restarts the worker (whatever it was reading
 * stops too, and the model loads again on the new device): voice and speed are per-request
 * parameters, and the GPU rejection is already known to the worker that made it.
 */
export function setKokoroDevice(pref: KokoroDevicePref) {
  devicePref = pref;
  if (worker && workerDevice !== pref) restartWorker();
}

/** Forgets that the GPU failed the check, and loads the model again so "auto" tries the GPU. */
export function retryKokoroGpu() {
  try {
    localStorage.removeItem(GPU_REJECTION_KEY);
  } catch {
    // Storage blocked: nothing was remembered either.
  }
  restartWorker();
  return loadKokoro();
}

function restartWorker() {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.resolve();
  pending.clear();
  const waiters = readyWaiters;
  readyWaiters = [];
  setStatus({ state: "idle" });
  // Whoever was waiting for the old worker waits for the new one.
  if (waiters.length > 0) {
    loadKokoro().then(
      () => waiters.forEach((w) => w.resolve()),
      (error: Error) => waiters.forEach((w) => w.reject(error)),
    );
  }
}

function failAll(message: string) {
  setStatus({ state: "error", message });
  const error = new Error(message);
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  readyWaiters.forEach((w) => w.reject(error));
  readyWaiters = [];
}

function handle(message: KokoroResponse) {
  switch (message.type) {
    case "progress":
      // Cached files report no size; the model is already here, so just "loading".
      setStatus({
        state: "loading",
        progress: message.total > 0 ? message.loaded / message.total : null,
        device: message.device,
        dtype: message.dtype,
      });
      break;
    case "ready":
      setStatus({
        state: "ready",
        device: message.device,
        dtype: message.dtype,
        adapter: message.adapter,
        threads: message.threads,
        warning: message.warning,
        diagnostics: message.diagnostics,
      });
      readyWaiters.forEach((w) => w.resolve());
      readyWaiters = [];
      break;
    case "gpu-rejected":
      console.warn(`Kokoro: the GPU's audio failed the check (${message.reason}); using the CPU from now on.`);
      toast.warning("Kokoro's GPU audio didn't sound like speech, so it switched to the CPU.", {
        description: `${message.reason}. Settings → Listening can try the GPU again.`,
      });
      try {
        localStorage.setItem(GPU_REJECTION_KEY, JSON.stringify({ reason: message.reason, at: message.at }));
      } catch {
        // Storage blocked: the GPU is tested again next time.
      }
      break;
    case "warning":
      if (status.state === "ready") setStatus({ ...status, warning: message.message });
      break;
    case "error":
      failAll(message.message);
      break;
    case "chunk":
      pending.get(message.id)?.onChunk(message.samples, message.sampleRate, message.device);
      break;
    case "done":
      pending.get(message.id)?.onComplete();
      pending.get(message.id)?.resolve();
      pending.delete(message.id);
      break;
    case "failed":
      pending.get(message.id)?.reject(new Error(message.message));
      pending.delete(message.id);
      break;
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  worker = w;
  w.addEventListener("message", (event: MessageEvent<KokoroResponse>) => {
    if (worker === w) handle(event.data);
  });
  // The worker itself died (e.g. its script failed to load): start a fresh one next time.
  w.addEventListener("error", (event) => {
    event.preventDefault();
    w.terminate();
    if (worker !== w) return;
    worker = null;
    failAll(event.message || "The Kokoro worker stopped");
  });
  const config = currentConfig();
  workerDevice = config.device;
  w.postMessage({ type: "configure", config } satisfies KokoroRequest);
  return w;
}

function send(request: KokoroRequest) {
  getWorker().postMessage(request);
}

/** Starts loading the model (if it isn't loaded or loading) and resolves when it's ready. */
export function loadKokoro(): Promise<void> {
  if (!kokoroSupported()) return Promise.reject(new Error("This browser can't run Kokoro"));
  if (status.state === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    readyWaiters.push({ resolve, reject });
    if (status.state !== "loading") {
      setStatus({ state: "loading", progress: null, device: null, dtype: null });
      send({ type: "load" });
    }
  });
}

/**
 * Synthesizes `text` chunk by chunk; `onChunk` gets each chunk's audio as soon as it's ready.
 * `done` resolves after the last one, and rejects if the model can't load or synthesis fails.
 * Audio already synthesized for the same text, voice and speed comes from the cache (memory, then
 * IndexedDB) without touching the model.
 */
export function synthesize(
  text: string,
  options: { voice: string; speed: number },
  onChunk: OnChunk,
): { done: Promise<void>; cancel: () => void } {
  const key = cacheKey(text, options.voice, options.speed);
  const running = status.state === "ready" ? status.device : null;
  let cancelled = false;
  let id: number | null = null;

  const fromCache = (audio: { sampleRate: number; chunks: Float32Array[] }) => {
    for (const chunk of audio.chunks) onChunk(chunk, audio.sampleRate);
  };

  const fromModel = () =>
    new Promise<void>((resolve, reject) => {
      const requestId = nextId++;
      id = requestId;
      const chunks: Float32Array[] = [];
      let rate = 24000;
      let device: KokoroDevice = "wasm";
      pending.set(requestId, {
        onChunk(samples, sampleRate, chunkDevice) {
          chunks.push(samples);
          rate = sampleRate;
          device = chunkDevice;
          onChunk(samples, sampleRate);
        },
        onComplete() {
          if (chunks.length > 0) void putCachedAudio(key, { device, sampleRate: rate, chunks });
        },
        resolve,
        reject,
      });
      // Make sure the model is (being) loaded; a load failure rejects through failAll.
      loadKokoro().catch(() => {});
      send({ type: "speak", id: requestId, text, ...options });
    });

  const inMemory = cachedInMemory(key, devicePref, running);
  const done = inMemory
    ? Promise.resolve().then(() => {
        if (!cancelled) fromCache(inMemory);
      })
    : getCachedAudio(key, devicePref, running).then((stored) => {
        if (cancelled) return;
        if (stored) return fromCache(stored);
        return fromModel();
      });

  return {
    done,
    cancel() {
      cancelled = true;
      if (id === null || !pending.has(id)) return;
      pending.get(id)?.resolve();
      pending.delete(id);
      worker?.postMessage({ type: "cancel", id } satisfies KokoroRequest);
    },
  };
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getKokoroStatus(): KokoroStatus {
  return status;
}

/** Whether the model is loading, ready or failed, with the download progress and the device in use. */
export function useKokoroStatus(): KokoroStatus {
  return useSyncExternalStore(subscribeStatus, getKokoroStatus, () => IDLE);
}

const IDLE: KokoroStatus = { state: "idle" };
