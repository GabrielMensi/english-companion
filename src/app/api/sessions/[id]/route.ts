import { z } from "zod";
import { deleteSession, getSession, updateSession } from "@/lib/chat";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { parseBody } from "@/lib/request-body";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["correction", "conversation"]).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  if (!getSession(id)) return Response.json({ error: "Chat not found" }, { status: 404 });

  const body = await parseBody(request, bodySchema, "Invalid data");
  if (!body.ok) return body.response;
  return Response.json(updateSession(id, body.data));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  deleteSession(id);
  // Its mistakes and words are gone: so are their flashcards.
  cleanOrphanReviews();
  return new Response(null, { status: 204 });
}
