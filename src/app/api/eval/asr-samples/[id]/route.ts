import { readSampleRecording, saveSampleRecording } from "@/lib/eval/asr-store";

/** The recording, for playback. */
export async function GET(_request: Request, ctx: RouteContext<"/api/eval/asr-samples/[id]">) {
  const { id } = await ctx.params;
  const wav = readSampleRecording(id);
  if (!wav) return Response.json({ error: "Not recorded yet" }, { status: 404 });
  return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}

/** Saves a recording (16 kHz mono WAV, encoded in the browser). */
export async function PUT(request: Request, ctx: RouteContext<"/api/eval/asr-samples/[id]">) {
  const { id } = await ctx.params;
  try {
    saveSampleRecording(id, Buffer.from(await request.arrayBuffer()));
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
