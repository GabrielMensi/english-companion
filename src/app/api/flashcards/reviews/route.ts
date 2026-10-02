import { z } from "zod";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { recordReview } from "@/lib/flashcards";
import { GRADES } from "@/lib/srs";

const bodySchema = z.object({
  kind: z.enum(CARD_KINDS),
  key: z.string().min(1).max(2000),
  grade: z.enum(GRADES),
});

/** The learner graded a flashcard: schedule its next review. */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid review" }, { status: 400 });
  const state = recordReview(body.data.kind, body.data.key, body.data.grade);
  return Response.json(state);
}
