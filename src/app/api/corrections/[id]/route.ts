import { z } from "zod";
import { classifyManually } from "@/lib/classification";
import { ERROR_CATEGORIES, TENSES } from "@/lib/taxonomy";

const bodySchema = z.object({
  category: z.enum(ERROR_CATEGORIES),
  subtype: z.string().min(1),
  tense: z.enum(TENSES).nullable(),
  tenseUsed: z.enum(TENSES).nullable(),
});

/** The learner fixes a mistake's type by hand. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/corrections/[id]">) {
  const { id } = await ctx.params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid type" }, { status: 400 });
  try {
    const correction = classifyManually(id, body.data);
    if (!correction) return Response.json({ error: "Mistake not found" }, { status: 404 });
    return Response.json(correction);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
