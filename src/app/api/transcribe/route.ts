import { errorToMessage } from "@/lib/ai/fallback";
import { TranscriptionUnavailableError, transcribeSpeech } from "@/lib/ai/transcribe";
import { withUser } from "@/lib/auth/with-user";
import { readBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
const MAX_BYTES = 10 * 1024 * 1024; // ~5 minutes of 16 kHz mono WAV

/** Transcribes a dictated message recorded in the browser (16 kHz mono WAV). */
export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const audio = await readBody(request, MAX_BYTES);
  if (!audio) return Response.json({ error: "The recording is too long (max ~5 minutes)" }, { status: 413 });
  if (audio.length === 0) return Response.json({ error: "The recording is empty" }, { status: 400 });
  if (String.fromCharCode(...audio.subarray(0, 4)) !== "RIFF") {
    return Response.json({ error: "Expected a WAV recording" }, { status: 400 });
  }

  try {
    return Response.json(await transcribeSpeech(userId, audio));
  } catch (error) {
    const status = error instanceof TranscriptionUnavailableError ? 409 : 502;
    logRouteError("POST /api/transcribe", error, status);
    return Response.json({ error: errorToMessage(error) }, { status });
  }
});
