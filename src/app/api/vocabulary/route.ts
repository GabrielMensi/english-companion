import { z } from "zod";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { deleteVocabulary } from "@/lib/vocabulary";
import { readJson } from "@/lib/request-body";

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

/** Deletes every lookup of a word (the client sends all its row ids). */
export async function DELETE(request: Request) {
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  deleteVocabulary(body.data.ids);
  cleanOrphanReviews();
  return new Response(null, { status: 204 });
}
