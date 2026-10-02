"use client";

import { useSyncExternalStore } from "react";

/**
 * Kokoro-82M text-to-speech, running in a Web Worker in this browser (see kokoro.worker.ts).
 * Nothing loads until Kokoro is first used: then the worker starts and the model is downloaded
 * once from Hugging Face and kept in the browser's Cache Storage.
 */

export type KokoroDevice = "webgpu" | "wasm";

export type KokoroRequest =
  | { type: "load" }
  | { type: "speak"; id: number; text: string; voice: string; speed: number }
  | { type: "cancel"; id: number };

export type KokoroResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: KokoroDevice }
  /** The model couldn't load: every pending request fails. */
  | { type: "error"; message: string }
  | { type: "chunk"; id: number; samples: Float32Array; sampleRate: number }
  | { type: "done"; id: number }
  | { type: "failed"; id: number; message: string };

export type KokoroStatus =
  | { state: "idle" }
  /** `progress` is 0–1 while downloading, null when it's unknown (e.g. loading from the cache). */
  | { state: "loading"; progress: number | null }
  | { state: "ready"; device: KokoroDevice }
  | { state: "error"; message: string };

interface Pending {
  onChunk: (samples: Float32Array, sampleRate: number) => void;
  resolve: () => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let status: KokoroStatus = { state: "idle" };
const statusListeners = new Set<() => void>();
const pending = new Map<number, Pending>();
let nextId = 1;
let readyWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];

function setStatus(next: KokoroStatus) {
  status = next;
  statusListeners.forEach((l) => l());
}

export function kokoroSupported() {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof AudioContext !== "undefined";
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
      setStatus({ state: "loading", progress: message.total > 0 ? message.loaded / message.total : null });
      break;
    case "ready":
      setStatus({ state: "ready", device: message.device });
      readyWaiters.forEach((w) => w.resolve());
      readyWaiters = [];
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
  worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<KokoroResponse>) => handle(event.data));
  // The worker itself died (e.g. its script failed to load): start a fresh one next time.
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    worker?.terminate();
    worker = null;
    failAll(event.message || "The Kokoro worker stopped");
  });
  return worker;
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
      setStatus({ state: "loading", progress: null });
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

/** Whether the model is loading, ready or failed, with the download progress. */
export function useKokoroStatus(): KokoroStatus {
  return useSyncExternalStore(subscribeStatus, getKokoroStatus, () => IDLE);
}

const IDLE: KokoroStatus = { state: "idle" };
