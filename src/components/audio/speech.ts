"use client";

import { useSyncExternalStore } from "react";

/**
 * Text-to-speech with the browser's `speechSynthesis`. The voice and speed are
 * per browser (each one has its own voices), so they're kept in localStorage.
 */

export interface SpeechPrefs {
  /** `voiceURI` of the chosen voice; null picks the best English voice available. */
  voice: string | null;
  rate: number;
}

const PREFS_KEY = "speech-prefs";
const DEFAULT_PREFS: SpeechPrefs = { voice: null, rate: 1 };

export function getSpeechPrefs(): SpeechPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<SpeechPrefs> | null;
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveSpeechPrefs(prefs: SpeechPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** English voices, best first: Edge's "Natural" (online) voices, then US English, then the rest. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const score = (v: SpeechSynthesisVoice) =>
    (/natural/i.test(v.name) ? 4 : 0) + (/^en[-_]US$/i.test(v.lang) ? 2 : 0) + (v.localService ? 0 : 1);
  return speechSynthesis
    .getVoices()
    .filter((v) => /^en\b/i.test(v.lang))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

function pickVoice(prefs: SpeechPrefs): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  return voices.find((v) => v.voiceURI === prefs.voice) ?? voices[0];
}

// What is being read right now, so every ▶ button can show whether it's the one playing.
let speakingId: string | null = null;
/** Increases with every `speak`, so an interrupted utterance doesn't clear the one that replaced it. */
let turn = 0;
const listeners = new Set<() => void>();

function setSpeaking(id: string | null) {
  speakingId = id;
  listeners.forEach((l) => l());
}

/**
 * Reads the text aloud, interrupting whatever was playing. Resolves when it ends
 * or is interrupted. `id` identifies the button (or message) that started it.
 */
export function speak(text: string, id: string = text): Promise<void> {
  if (!speechSupported() || !text.trim()) return Promise.resolve();
  speechSynthesis.cancel();
  const prefs = getSpeechPrefs();
  const voice = pickVoice(prefs);
  // Sentence by sentence: some voices stop after ~15 s in a single utterance.
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];

  const current = ++turn;
  setSpeaking(id);
  return new Promise((resolve) => {
    sentences.forEach((sentence, i) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice;
      utterance.rate = prefs.rate;
      if (i === sentences.length - 1) {
        const done = () => {
          if (turn === current) setSpeaking(null);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
      }
      speechSynthesis.speak(utterance);
    });
  });
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  turn++;
  speechSynthesis.cancel();
  setSpeaking(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether `id` is the text being read aloud right now. */
export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => speakingId === id,
    () => false,
  );
}

function subscribeVoices(listener: () => void) {
  if (!speechSupported()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", listener);
  return () => speechSynthesis.removeEventListener("voiceschanged", listener);
}

let voicesCache: { key: string; voices: SpeechSynthesisVoice[] } = { key: "", voices: [] };

/** English voices of this browser; they load asynchronously, so the list can start empty. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    subscribeVoices,
    () => {
      const voices = englishVoices();
      // Same array while the voices don't change, as useSyncExternalStore requires.
      const key = voices.map((v) => v.voiceURI).join("|");
      if (key !== voicesCache.key) voicesCache = { key, voices };
      return voicesCache.voices;
    },
    () => voicesCache.voices,
  );
}

/** False on the server and in browsers without speech synthesis, so ▶ buttons don't flash in. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    () => () => {},
    speechSupported,
    () => false,
  );
}

const VOICE_MODE_KEY = "voice-mode";
const voiceModeListeners = new Set<() => void>();

function readVoiceMode() {
  try {
    return localStorage.getItem(VOICE_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

/** Voice conversation on or off, remembered in this browser for every chat. */
export function useVoiceMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (listener) => {
      voiceModeListeners.add(listener);
      return () => voiceModeListeners.delete(listener);
    },
    readVoiceMode,
    () => false,
  );
  const set = (value: boolean) => {
    try {
      localStorage.setItem(VOICE_MODE_KEY, value ? "on" : "off");
    } catch {
      // Storage blocked: voice mode can't be turned on.
    }
    voiceModeListeners.forEach((l) => l());
  };
  return [on, set];
}
