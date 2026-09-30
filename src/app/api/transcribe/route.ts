import { errorToMessage } from "@/lib/ai/fallback";
import { TranscriptionUnavailableError, transcribeSpeech } from "@/lib/ai/transcribe";

const MAX_BYTES = 10 * 1024 * 1024; // ~5 minutes of 16 kHz mono WAV

/** Transcribes a dictated message recorded in the browser (16 kHz mono WAV). */
export async function POST(request: Request) {
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length === 0) return Response.json({ error: "The recording is empty" }, { status: 400 });
  if (audio.length > MAX_BYTES) return Response.json({ error: "The recording is too long (max ~5 minutes)" }, { status: 413 });
  if (String.fromCharCode(...audio.subarray(0, 4)) !== "RIFF") {
    return Response.json({ error: "Expected a WAV recording" }, { status: 400 });
  }

  try {
    return Response.json(await transcribeSpeech(audio));
  } catch (error) {
    const status = error instanceof TranscriptionUnavailableError ? 409 : 502;
    return Response.json({ error: errorToMessage(error) }, { status });
  }
}
