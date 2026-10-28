import { canUseEval } from "@/lib/auth/admin";
import { MAX_RECORDING_BYTES, readSampleRecording, saveSampleRecording } from "@/lib/eval/asr-store";
import { readBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { notFound, withUser } from "@/lib/auth/with-user";

/** The recording, for playback. */
export const GET = withUser(async (_request: Request, ctx: RouteContext<"/api/eval/asr-samples/[id]">, { userId }) => {
  if (!canUseEval(userId)) return notFound();
  const { id } = await ctx.params;
  const wav = readSampleRecording(id);
  if (!wav) return Response.json({ error: "Not recorded yet" }, { status: 404 });
  return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
});

/** Saves a recording (16 kHz mono WAV, encoded in the browser). */
export const PUT = withUser(async (request: Request, ctx: RouteContext<"/api/eval/asr-samples/[id]">, { userId }) => {
  if (!canUseEval(userId)) return notFound();
  const { id } = await ctx.params;
  const wav = await readBody(request, MAX_RECORDING_BYTES);
  if (!wav) return Response.json({ error: "Recording too long" }, { status: 413 });
  try {
    saveSampleRecording(id, Buffer.from(wav));
    return new Response(null, { status: 204 });
  } catch (error) {
    logRouteError("PUT /api/eval/asr-samples/[id]", error, 400);
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
});
