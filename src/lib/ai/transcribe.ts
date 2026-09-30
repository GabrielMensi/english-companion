import "server-only";

import { transcribe } from "ai";
import { resolveTranscriptionModel } from "./providers";

const TIMEOUT_MS = 30_000;

export class TranscriptionUnavailableError extends Error {
  constructor() {
    super("Dictation needs a Groq API key. Add it in Settings.");
    this.name = "TranscriptionUnavailableError";
  }
}

/** Transcribes a dictated message (16 kHz mono WAV) word for word. */
export async function transcribeSpeech(audio: Uint8Array) {
  const resolved = resolveTranscriptionModel();
  if (!resolved) throw new TranscriptionUnavailableError();

  const started = Date.now();
  const result = await transcribe({
    model: resolved.model,
    audio,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    // Temperature 0 is the most literal; the language avoids detecting Spanish from the accent.
    providerOptions: { groq: { language: "en", temperature: 0 } },
  });
  return {
    text: result.text.trim(),
    provider: resolved.provider,
    model: resolved.modelId,
    durationMs: Date.now() - started,
  };
}
