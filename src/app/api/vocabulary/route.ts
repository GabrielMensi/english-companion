import { z } from "zod";
import { deleteVocabulary } from "@/lib/vocabulary";

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

/** Deletes every lookup of a word (the client sends all its row ids). */
export async function DELETE(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  deleteVocabulary(body.data.ids);
  return new Response(null, { status: 204 });
}
