import { z } from "@/lib/zod";
import { classifyManually } from "@/lib/classification";
import { getCorrectionUpdate } from "@/lib/corrections";
import { ERROR_CATEGORIES, TENSES } from "@/lib/taxonomy";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({
  category: z.enum(ERROR_CATEGORIES),
  subtype: z.string().min(1),
  tense: z.enum(TENSES).nullable(),
  tenseUsed: z.enum(TENSES).nullable(),
});

/** The learner fixes a mistake's type by hand. Returns a `CorrectionUpdate`. */
export const PATCH = withUser(async (request: Request, ctx: RouteContext<"/api/corrections/[id]">) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, bodySchema, "Invalid type");
  if (!body.ok) return body.response;
  try {
    const update = classifyManually(id, body.data) ? getCorrectionUpdate(id) : undefined;
    if (!update) return Response.json({ error: "Mistake not found" }, { status: 404 });
    return Response.json(update);
  } catch (error) {
    logRouteError("PATCH /api/corrections/[id]", error, 400);
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
});
