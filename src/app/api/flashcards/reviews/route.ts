import { z } from "zod";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { recordReview } from "@/lib/flashcards";
import { GRADES } from "@/lib/srs";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({
  kind: z.enum(CARD_KINDS),
  key: z.string().min(1).max(2000),
  grade: z.enum(GRADES),
});

/** The learner graded a flashcard: schedule its next review. */
export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid review");
  if (!body.ok) return body.response;
  const state = recordReview(userId, body.data.kind, body.data.key, body.data.grade);
  return Response.json(state);
});
