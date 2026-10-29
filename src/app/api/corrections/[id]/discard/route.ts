import { withUser } from "@/lib/auth/with-user";
import { discardCorrection, restoreCorrection } from "@/lib/corrections";
import { parseBody } from "@/lib/request-body";
import { z } from "@/lib/zod";

const bodySchema = z.object({ reason: z.string().trim().max(500).nullish() }).nullable();

/** The learner discards a wrong correction: it stays, but no statistic counts it. Returns a `CorrectionUpdate`. */
export const POST = withUser(
  async (request: Request, ctx: RouteContext<"/api/corrections/[id]/discard">, { userId }) => {
    const { id } = await ctx.params;
    const body = await parseBody(request, bodySchema, "Invalid reason");
    if (!body.ok) return body.response;
    const update = discardCorrection(userId, id, body.data?.reason || null);
    if (!update) return Response.json({ error: "Mistake not found" }, { status: 404 });
    return Response.json(update);
  },
);

/** Undoes a discard. Returns a `CorrectionUpdate`. */
export const DELETE = withUser(
  async (_request: Request, ctx: RouteContext<"/api/corrections/[id]/discard">, { userId }) => {
    const { id } = await ctx.params;
    const update = restoreCorrection(userId, id);
    if (!update) return Response.json({ error: "Mistake not found" }, { status: 404 });
    return Response.json(update);
  },
);
