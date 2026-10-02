import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { startPractice } from "@/lib/practice-start";
import { TENSES } from "@/lib/taxonomy";
import { EXERCISE_KINDS } from "@/lib/tense-practice";

const bodySchema = z.object({
  kind: z.enum([...EXERCISE_KINDS, "conversation"]),
  tense: z.enum(TENSES),
  contrastWith: z.enum(TENSES).nullable().default(null),
});

/** Starts a tense practice chat and returns its session. */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  try {
    return Response.json(await startPractice(body.data), { status: 201 });
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
