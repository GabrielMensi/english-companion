/**
 * Pieces of Kokoro's audio cache that don't need the browser (pure, so they can be tested). The
 * cache itself (memory + IndexedDB) is in audio-cache.ts.
 */
import type { KokoroDevicePref } from "./speech-prefs";

export type CachedDevice = "webgpu" | "wasm";

export interface CachedAudio {
  /** The device that synthesized it (its audio passed the check if it was the GPU). */
  device: CachedDevice;
  sampleRate: number;
  /** One per synthesized chunk, played back to back. */
  chunks: Float32Array[];
}

/** Same text, voice and speed give the same audio; the device is stored in the entry (see `usableFor`). */
export function cacheKey(text: string, voice: string, speed: number): string {
  return `${voice}|${speed}|${text.trim()}`;
}

export function audioBytes(audio: Pick<CachedAudio, "chunks">): number {
  return audio.chunks.reduce((sum, c) => sum + c.byteLength, 0);
}

/**
 * Whether a cached entry may be played: when the model is running, only audio made on the device
 * in use; before it loads, audio from the chosen device (any device for "auto"), so a replay
 * after reloading the page doesn't have to wait for the model.
 */
export function usableFor(entry: Pick<CachedAudio, "device">, pref: KokoroDevicePref, running: CachedDevice | null) {
  if (running) return entry.device === running;
  return pref === "auto" || entry.device === pref;
}

/** A least-recently-used map capped by total bytes. */
export class ByteLru<V> {
  private entries = new Map<string, { value: V; bytes: number }>();
  private total = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (value: V) => number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Re-insert, so it's the most recent.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V) {
    this.delete(key);
    const bytes = this.sizeOf(value);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes });
    this.total += bytes;
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.total -= entry.bytes;
    }
  }

  delete(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.total -= entry.bytes;
  }

  get size() {
    return this.entries.size;
  }

  get bytes() {
    return this.total;
  }
}

/** Which stored entries to delete, least recently used first, so the rest fit in `maxBytes`. */
export function keysToEvict(entries: { key: string; bytes: number; lastUsed: number }[], maxBytes: number): string[] {
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  const evict: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= maxBytes) break;
    evict.push(entry.key);
    total -= entry.bytes;
  }
  return evict;
}
