"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
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
}

export type KokoroRequest =
  | { type: "configure"; config: KokoroConfig }
  | { type: "load" }
  | { type: "speak"; id: number; text: string; voice: string; speed: number }
  | { type: "cancel"; id: number };

export type KokoroResponse =
  | { type: "progress"; device: KokoroDevice; dtype: KokoroDtype; loaded: number; total: number }
  | { type: "ready"; device: KokoroDevice; dtype: KokoroDtype; adapter: string | null; warning: string | null }
  /** The GPU's audio failed the check in auto mode; the worker is switching to the CPU. */
  | { type: "gpu-rejected"; reason: string; at: string }
  /** The GPU (forced in Settings) produced audio that failed the check. */
  | { type: "warning"; message: string }
  /** The model couldn't load: every pending request fails. */
  | { type: "error"; message: string }
  | { type: "chunk"; id: number; samples: Float32Array; sampleRate: number }
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
      /** Something to show next to the status: a fallback to the CPU or a failed audio check. */
      warning: string | null;
    }
  | { state: "error"; message: string };

interface Pending {
  onChunk: (samples: Float32Array, sampleRate: number) => void;
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
/** The config the running worker was started with. */
let workerConfigKey = "";

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

function currentConfig(): KokoroConfig {
  const simulate = process.env.NODE_ENV === "production" ? null : readStorage(SIMULATE_NOISE_KEY);
  return {
    device: devicePref,
    gpuRejection: getGpuRejection(),
    simulateNoise:
      simulate === "webgpu" || simulate === "wasm" || simulate === "all" || simulate === "webgpu-speech"
        ? simulate
        : null,
  };
}

/**
 * Sets where Kokoro runs. If a worker is running with another setting, it's stopped (whatever it
 * was reading stops too) and the model loads again on the new device the next time it's needed.
 */
export function setKokoroDevice(pref: KokoroDevicePref) {
  devicePref = pref;
  if (worker && JSON.stringify(currentConfig()) !== workerConfigKey) restartWorker();
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
        warning: message.warning,
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
      // The worker already knows; keep its config key current so it isn't restarted for this.
      workerConfigKey = JSON.stringify(currentConfig());
      break;
    case "warning":
      if (status.state === "ready") setStatus({ ...status, warning: message.message });
      break;
    case "error":
      failAll(message.message);
      break;
    case "chunk":
      pending.get(message.id)?.onChunk(message.samples, message.sampleRate);
      break;
    case "done":
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
  workerConfigKey = JSON.stringify(config);
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
 * Synthesizes `text` sentence by sentence; `onChunk` gets each sentence's audio as soon as it's
 * ready. `done` resolves after the last one, and rejects if the model can't load or synthesis fails.
 */
export function synthesize(
  text: string,
  options: { voice: string; speed: number },
  onChunk: Pending["onChunk"],
): { done: Promise<void>; cancel: () => void } {
  const id = nextId++;
  const done = new Promise<void>((resolve, reject) => {
    pending.set(id, { onChunk, resolve, reject });
  });
  // Make sure the model is (being) loaded; a load failure rejects `done` through failAll.
  loadKokoro().catch(() => {});
  send({ type: "speak", id, text, ...options });
  return {
    done,
    cancel() {
      if (!pending.has(id)) return;
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
