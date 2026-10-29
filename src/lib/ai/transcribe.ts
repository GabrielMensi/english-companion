import "server-only";

import { APICallError } from "ai";

import { computeFluency, wordsFromResponse } from "@/lib/fluency";

import { UserFacingError } from "./fallback";
import { resolveTranscriptionModel } from "./providers";

const TIMEOUT_MS = 30_000;

export class TranscriptionUnavailableError extends UserFacingError {
  constructor() {
    super("Dictation needs a Groq API key. Add it in Settings.");
    this.name = "TranscriptionUnavailableError";
  }
}

/** Transcribes a dictated message (16 kHz mono WAV) word for word, with fluency metrics from the word timestamps. */
export async function transcribeSpeech(userId: string, audio: Uint8Array) {
  const resolved = resolveTranscriptionModel(userId);
  if (!resolved) throw new TranscriptionUnavailableError();

  const started = Date.now();
  // Called on the model directly: `transcribe()` drops the raw response, and the word timestamps are only there.
  const generate = async () =>
    resolved.model.doGenerate({
      audio,
      mediaType: "audio/wav",
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      // Temperature 0 is the most literal; the language avoids detecting Spanish from the accent.
      providerOptions: {
        groq: { language: "en", temperature: 0, responseFormat: "verbose_json", timestampGranularities: ["word"] },
      },
    });
  const result = await generate().catch((error: unknown) => {
    if (APICallError.isInstance(error) && error.isRetryable) return generate();
    throw error;
  });

  return {
    text: result.text.trim(),
    provider: resolved.provider,
    model: resolved.modelId,
    durationMs: Date.now() - started,
    fluency: computeFluency(wordsFromResponse(result.response?.body)),
  };
}
