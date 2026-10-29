"use client";

import { useState } from "react";
import { toast } from "sonner";

import { stopSpeaking } from "@/components/audio/speech";
import { useRecorder } from "@/components/audio/use-recorder";
import type { ReadAloudSource } from "@/db/schema";
import type { PhonemeCheckResult } from "@/lib/phonemes-core";
import type { ReadAloudResult } from "@/lib/pronunciation-core";
import type { PronunciationSummary } from "@/lib/read-aloud-core";
import type { PronunciationCategory } from "@/lib/taxonomy";

/** What was read: saved with the attempt. */
export interface Reading {
  text: string;
  source: ReadAloudSource;
  sourceId: string | null;
  focus: PronunciationCategory | null;
}

export interface ReadingOutcome {
  transcript: string;
  score: ReadAloudResult;
  summary: PronunciationSummary | null;
  /** The beta sound check of the recording, when asked for: resolves to null if it couldn't be asked. */
  soundCheck: Promise<PhonemeCheckResult | null> | null;
}

/** Sends the recording to the beta sound check; never rejects (the reading's result doesn't depend on it). */
async function askSoundCheck(wav: ArrayBuffer, text: string, transcript: string): Promise<PhonemeCheckResult | null> {
  try {
    const body = new FormData();
    body.set("audio", new Blob([wav], { type: "audio/wav" }));
    body.set("text", text);
    body.set("transcript", transcript);
    const res = await fetch("/api/read-aloud/phonemes", { method: "POST", body });
    return res.ok ? ((await res.json()) as PhonemeCheckResult) : null;
  } catch {
    return null;
  }
}

interface Transcription {
  text: string;
  provider: string;
  model: string;
}

/**
 * Records a sentence read aloud, transcribes it and scores it (saving the
 * attempt). Shared by the Read aloud page and the "Hard to say" flashcards.
 */
export function useReadAloud() {
  const recorder = useRecorder();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    // The tutor's voice would end up in the recording.
    stopSpeaking();
    try {
      await recorder.start();
    } catch (error) {
      toast.error(`Couldn't use the microphone: ${(error as Error).message}`);
    }
  }

  /** Stops and scores the reading; null if nothing was heard or it failed (a toast says why). */
  async function stop(reading: Reading, options: { soundCheck?: boolean } = {}): Promise<ReadingOutcome | null> {
    const recording = await recorder.stop();
    if (!recording) return null;
    setBusy(true);
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: recording.wav });
      const heard = (await res.json().catch(() => ({}))) as Partial<Transcription> & { error?: string };
      if (!res.ok || heard.text === undefined) throw new Error(heard.error ?? `Error ${res.status}`);
      if (!heard.text) {
        toast.info("I didn't hear anything. Try again a bit closer to the microphone.");
        return null;
      }
      const saved = await fetch("/api/read-aloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reading,
          transcript: heard.text,
          transcriptionProvider: heard.provider ?? null,
          transcriptionModel: heard.model ?? null,
          audioDurationMs: recording.durationMs,
        }),
      });
      const data = (await saved.json().catch(() => ({}))) as {
        result?: ReadAloudResult;
        summary?: PronunciationSummary;
        error?: string;
      };
      if (!saved.ok || !data.result) throw new Error(data.error ?? `Error ${saved.status}`);
      return {
        transcript: heard.text,
        score: data.result,
        summary: data.summary ?? null,
        soundCheck: options.soundCheck ? askSoundCheck(recording.wav, reading.text, heard.text) : null,
      };
    } catch (error) {
      toast.error(`Couldn't check the reading: ${(error as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { recording: recorder.recording, busy, start, stop, cancel: recorder.cancel };
}
