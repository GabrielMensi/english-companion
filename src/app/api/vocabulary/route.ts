import { z } from "zod";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { deleteVocabulary } from "@/lib/vocabulary";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

/** Deletes every lookup of a word (the client sends all its row ids). */
export const DELETE = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid data");
  if (!body.ok) return body.response;
  deleteVocabulary(userId, body.data.ids);
  cleanOrphanReviews(userId);
  return new Response(null, { status: 204 });
});
