import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { startCategoryPractice, startPractice } from "@/lib/practice-start";
import { ERROR_CATEGORIES, TENSES } from "@/lib/taxonomy";
import { EXERCISE_KINDS } from "@/lib/tense-practice";

const bodySchema = z.union([
  z.object({
    kind: z.enum([...EXERCISE_KINDS, "conversation"]),
    tense: z.enum(TENSES),
    contrastWith: z.enum(TENSES).nullable().default(null),
  }),
  z.object({
    kind: z.literal("category"),
    category: z.enum(ERROR_CATEGORIES),
    subtype: z.string().max(100).nullable().default(null),
  }),
]);

/** Starts a practice chat (tense practice, or exercises for an error category) and returns its session. */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  try {
    const session = body.data.kind === "category" ? await startCategoryPractice(body.data) : await startPractice(body.data);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
