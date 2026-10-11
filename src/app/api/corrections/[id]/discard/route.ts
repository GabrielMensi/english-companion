import { z } from "zod";
import { discardCorrection, restoreCorrection } from "@/lib/corrections";
import { readJson } from "@/lib/request-body";

const bodySchema = z.object({ reason: z.string().trim().max(500).nullish() }).nullable();

/** The learner discards a wrong correction: it stays, but no statistic counts it. Returns a `CorrectionUpdate`. */
export async function POST(request: Request, ctx: RouteContext<"/api/corrections/[id]/discard">) {
  const { id } = await ctx.params;
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json({ error: "Invalid reason" }, { status: 400 });
  const update = discardCorrection(id, body.data?.reason || null);
  if (!update) return Response.json({ error: "Mistake not found" }, { status: 404 });
  return Response.json(update);
}

/** Undoes a discard. Returns a `CorrectionUpdate`. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/corrections/[id]/discard">) {
  const { id } = await ctx.params;
  const update = restoreCorrection(id);
  if (!update) return Response.json({ error: "Mistake not found" }, { status: 404 });
  return Response.json(update);
}
