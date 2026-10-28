import { z } from "zod";
import { cmuLookup } from "@/lib/cmu-lookup";
import { checkPhonemes } from "@/lib/phonemes";
import { scoreReading } from "@/lib/pronunciation-core";

/** ~60 s of 16 kHz mono WAV, the longest recording the sound check looks at. */
const MAX_BYTES = 2 * 1024 * 1024;

const fieldsSchema = z.object({
  text: z.string().trim().min(1).max(500),
  transcript: z.string().max(2000),
});

/**
 * Sound check (beta) of a read-aloud attempt: the recording and the sentence in, hints and checks
 * of the transcript-based result out. Nothing is saved. Separate from /api/read-aloud so a slow or
 * missing model never delays the result.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 8192) {
    return Response.json({ error: "The recording is too long" }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const fields = fieldsSchema.safeParse({ text: form?.get("text"), transcript: form?.get("transcript") });
  if (!(audio instanceof Blob) || !fields.success || audio.size === 0 || audio.size > MAX_BYTES) {
    return Response.json({ error: "Invalid data" }, { status: 400 });
  }

  // The same scoring as the saved attempt, so the checks line up with its issues.
  const { issues } = scoreReading(fields.data.text, fields.data.transcript, cmuLookup);
  const result = await checkPhonemes(new Uint8Array(await audio.arrayBuffer()), fields.data.text, issues);
  return Response.json(result);
}
