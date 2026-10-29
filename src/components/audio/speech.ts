"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { getKokoroStatus, kokoroSupported, loadKokoro, setKokoroDevice, synthesize } from "@/components/audio/kokoro";
import { parseSpeechPrefs, type SpeechPrefs } from "@/components/audio/speech-prefs";

/**
 * Text-to-speech for ▶ buttons, voice mode and the floating window: the one place that decides
 * which engine reads aloud. The default is the browser's `speechSynthesis`; Kokoro (a local
 * model, see kokoro.ts) is optional, and if it can't load the browser's voice takes over.
 * Preferences are per browser (each one has its own voices and its own model cache), so they're
 * kept in localStorage.
 */

export type { SpeechPrefs } from "@/components/audio/speech-prefs";

const PREFS_KEY = "speech-prefs";

export function getSpeechPrefs(): SpeechPrefs {
  try {
    return parseSpeechPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return parseSpeechPrefs(null);
  }
}

export function saveSpeechPrefs(prefs: SpeechPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
  // Choosing Kokoro again is also how to retry it after it failed.
  if (prefs.engine === "kokoro") kokoroFailed = false;
  setKokoroDevice(prefs.kokoroDevice);
}

function browserSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speechSupported() {
  return browserSpeechSupported() || kokoroSupported();
}

/** English voices, best first: Edge's "Natural" (online) voices, then US English, then the rest. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!browserSpeechSupported()) return [];
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
/** True until the first audio plays (Kokoro loading the model or synthesizing the first sentence). */
let preparing = false;
/** Increases with every `speak`, so an interrupted utterance doesn't clear the one that replaced it. */
let turn = 0;
const listeners = new Set<() => void>();
/** Stops whatever the current engine is playing. */
let stopCurrent: () => void = () => {};
/** Kokoro failed to load in this page: use the browser's voice until it's chosen again in Settings. */
let kokoroFailed = false;

function setSpeaking(id: string | null, isPreparing = false) {
  speakingId = id;
  preparing = id !== null && isPreparing;
  listeners.forEach((l) => l());
}

/**
 * Reads the text aloud, interrupting whatever was playing. Resolves when it ends
 * or is interrupted. `id` identifies the button (or message) that started it.
 */
export function speak(text: string, id: string = text): Promise<void> {
  if (!text.trim()) return Promise.resolve();
  stopEngines();
  const prefs = getSpeechPrefs();
  const current = ++turn;
  if (prefs.engine === "kokoro" && !kokoroFailed && kokoroSupported()) {
    setKokoroDevice(prefs.kokoroDevice);
    return speakKokoro(text, id, prefs, current);
  }
  return speakBrowser(text, id, prefs, current);
}

function speakBrowser(text: string, id: string, prefs: SpeechPrefs, current: number): Promise<void> {
  if (!browserSpeechSupported()) {
    if (turn === current) setSpeaking(null);
    return Promise.resolve();
  }
  const voice = pickVoice(prefs);
  // Sentence by sentence: some voices stop after ~15 s in a single utterance.
  const sentences = splitSentences(text);

  setSpeaking(id);
  stopCurrent = () => speechSynthesis.cancel();
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

function splitSentences(text: string) {
  return (
    text
      .match(/[^.!?\n]+(?:[.!?]+|\n|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [text]
  );
}

let audioContext: AudioContext | null = null;

/**
 * Kokoro's audio plays through a Web Audio context of this page. The floating window shares the
 * page's JS realm, so this also works while it's open; the sound comes from the tab.
 */
function getAudioContext() {
  audioContext ??= new AudioContext();
  // Created or suspended without a user gesture (e.g. voice mode replies): resuming works once the
  // user has interacted with the page.
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function speakKokoro(text: string, id: string, prefs: SpeechPrefs, current: number): Promise<void> {
  const context = getAudioContext();
  const sources = new Set<AudioBufferSourceNode>();
  let playUntil = 0;
  let played = false;
  let synthesisDone = false;
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));

  const end = () => {
    if (turn === current) setSpeaking(null);
    finish();
  };
  const maybeEnd = () => {
    if (synthesisDone && sources.size === 0) end();
  };

  setSpeaking(id, true);
  const synthesis = synthesize(text, { voice: prefs.kokoroVoice, speed: prefs.rate }, (samples, sampleRate) => {
    if (turn !== current) return;
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    // Back to back with the previous sentence, or right away if it already ended.
    const start = Math.max(context.currentTime, playUntil);
    source.start(start);
    playUntil = start + buffer.duration;
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      maybeEnd();
    };
    if (!played) {
      played = true;
      setSpeaking(id);
    }
  });

  stopCurrent = () => {
    synthesis.cancel();
    for (const source of sources) {
      source.onended = null;
      source.stop();
    }
    sources.clear();
    finish();
  };

  synthesis.done.then(
    () => {
      synthesisDone = true;
      maybeEnd();
    },
    (error: Error) => {
      synthesisDone = true;
      if (turn !== current) return finish();
      // The model couldn't load: switch to the browser's voice for the rest of the session.
      if (getKokoroStatus().state === "error") {
        kokoroFailed = true;
        console.warn("Kokoro failed, using the browser's voice", error);
        toast.error(`Kokoro couldn't load (${error.message}). Using the browser's voice instead.`);
      }
      if (played) return maybeEnd();
      // speakBrowser doesn't reject, but `finished` must resolve whatever happens.
      speakBrowser(text, id, prefs, current).then(finish, finish);
    },
  );
  return finished;
}

/** Stops both engines without touching the speaking state. */
function stopEngines() {
  stopCurrent();
  stopCurrent = () => {};
  if (browserSpeechSupported()) speechSynthesis.cancel();
}

export function stopSpeaking() {
  turn++;
  stopEngines();
  setSpeaking(null);
}

/**
 * Starts loading Kokoro in the background if it's the chosen engine (e.g. when voice mode is
 * turned on), so the first reply doesn't wait for the model.
 */
export function preloadSpeech() {
  const prefs = getSpeechPrefs();
  if (prefs.engine !== "kokoro" || kokoroFailed || !kokoroSupported()) return;
  setKokoroDevice(prefs.kokoroDevice);
  loadKokoro().catch(() => {});
}

/** Tries loading Kokoro again after it failed (Settings' "Retry"); speaking uses it again if it works. */
export function retryKokoro() {
  kokoroFailed = false;
  setKokoroDevice(getSpeechPrefs().kokoroDevice);
  loadKokoro().catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether `id` is the text being read aloud right now (including while Kokoro prepares it). */
export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => speakingId === id,
    () => false,
  );
}

/** Whether `id` is waiting for its first audio (Kokoro loading the model or synthesizing). */
export function useSpeechPreparing(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => speakingId === id && preparing,
    () => false,
  );
}

function subscribeVoices(listener: () => void) {
  if (!browserSpeechSupported()) return () => {};
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

/** False on the server and in browsers that can't speak at all, so ▶ buttons don't flash in. */
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
