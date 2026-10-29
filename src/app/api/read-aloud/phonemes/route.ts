import { withUser } from "@/lib/auth/with-user";
import { cmuLookup } from "@/lib/cmu-lookup";
import { checkPhonemes } from "@/lib/phonemes";
import { scoreReading } from "@/lib/pronunciation-core";
import { readBody } from "@/lib/request-body";
import { z } from "@/lib/zod";

/** ~30 s of 16 kHz mono WAV (32 KB/s), the longest recording the sound check looks at, plus the form fields. */
const MAX_BYTES = 1024 * 1024 + 16 * 1024;
const MAX_AUDIO_BYTES = 1024 * 1024;

const fieldsSchema = z.object({
  text: z.string().trim().min(1).max(500),
  transcript: z.string().max(2000),
});

/**
 * Sound check (beta) of a read-aloud attempt: the recording and the sentence in, hints and checks
 * of the transcript-based result out. Nothing is saved. Separate from /api/read-aloud so a slow or
 * missing model never delays the result. The most expensive route in the app, so it needs a
 * session like all the others.
 */
export const POST = withUser(async (request: Request) => {
  // Hard limit on the bytes read, whatever Content-Length says.
  const raw = await readBody(request, MAX_BYTES);
  if (!raw) return Response.json({ error: "The recording is too long" }, { status: 413 });
  const form = await new Response(new Blob([raw.slice().buffer]), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  })
    .formData()
    .catch(() => null);
  const audio = form?.get("audio");
  const fields = fieldsSchema.safeParse({ text: form?.get("text"), transcript: form?.get("transcript") });
  if (!(audio instanceof Blob) || !fields.success || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Invalid data" }, { status: 400 });
  }

  // The same scoring as the saved attempt, so the checks line up with its issues.
  const { issues } = scoreReading(fields.data.text, fields.data.transcript, cmuLookup);
  const result = await checkPhonemes(new Uint8Array(await audio.arrayBuffer()), fields.data.text, issues);
  return Response.json(result);
});
