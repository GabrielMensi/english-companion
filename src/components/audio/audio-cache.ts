"use client";

import {
  audioBytes,
  ByteLru,
  type CachedAudio,
  type CachedDevice,
  keysToEvict,
  usableFor,
} from "@/components/audio/audio-cache-core";
import type { KokoroDevicePref } from "@/components/audio/speech-prefs";

/**
 * Kokoro's synthesized audio, so ▶ on the same text plays at once instead of synthesizing again:
 * in memory for this page (LRU, ~40 MB ≈ 7 minutes of audio), and in IndexedDB so it survives a
 * reload (~60 MB, least recently played deleted first). Keyed by text, voice and speed; each entry
 * remembers its device (see `usableFor`).
 */

const MEMORY_BYTES = 40 * 1024 * 1024;
const STORED_BYTES = 60 * 1024 * 1024;
const DB_NAME = "kokoro-audio";
const AUDIO = "audio";
const META = "meta";

interface Meta {
  key: string;
  bytes: number;
  lastUsed: number;
  device: CachedDevice;
}

const memory = new ByteLru<CachedAudio>(MEMORY_BYTES, audioBytes);

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(AUDIO);
        request.result.createObjectStore(META, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      // Blocked or unavailable (private mode, etc.): memory only.
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Looks up audio in memory, synchronously (instant replays in the same page). */
export function cachedInMemory(
  key: string,
  pref: KokoroDevicePref,
  running: CachedDevice | null,
): CachedAudio | undefined {
  const hit = memory.get(key);
  return hit && usableFor(hit, pref, running) ? hit : undefined;
}

/** Looks up audio in memory, then in IndexedDB. */
export async function getCachedAudio(
  key: string,
  pref: KokoroDevicePref,
  running: CachedDevice | null,
): Promise<CachedAudio | undefined> {
  const inMemory = cachedInMemory(key, pref, running);
  if (inMemory) return inMemory;
  try {
    const db = await openDb();
    if (!db) return undefined;
    const tx = db.transaction([AUDIO, META], "readwrite");
    const stored = await result(tx.objectStore(AUDIO).get(key) as IDBRequest<CachedAudio | undefined>);
    if (!stored || !usableFor(stored, pref, running)) return undefined;
    tx.objectStore(META).put({
      key,
      bytes: audioBytes(stored),
      lastUsed: Date.now(),
      device: stored.device,
    } satisfies Meta);
    memory.set(key, stored);
    return stored;
  } catch {
    return undefined;
  }
}

/** Saves complete audio (never a cancelled, partial one). */
export async function putCachedAudio(key: string, audio: CachedAudio) {
  memory.set(key, audio);
  try {
    const db = await openDb();
    if (!db) return;
    const bytes = audioBytes(audio);
    if (bytes > STORED_BYTES) return;
    const tx = db.transaction([AUDIO, META], "readwrite");
    tx.objectStore(AUDIO).put(audio, key);
    tx.objectStore(META).put({ key, bytes, lastUsed: Date.now(), device: audio.device } satisfies Meta);
    await done(tx);
    await prune(db);
  } catch {
    // Quota or storage errors: the memory copy is enough.
  }
}

async function prune(db: IDBDatabase) {
  const metas = await result(db.transaction(META).objectStore(META).getAll() as IDBRequest<Meta[]>);
  const evict = keysToEvict(metas, STORED_BYTES);
  if (evict.length === 0) return;
  const tx = db.transaction([AUDIO, META], "readwrite");
  for (const key of evict) {
    tx.objectStore(AUDIO).delete(key);
    tx.objectStore(META).delete(key);
  }
  await done(tx);
}
