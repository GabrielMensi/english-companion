import { z } from "zod";
import { deleteSession, getSession, updateSession } from "@/lib/chat";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["correction", "conversation"]).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  if (!getSession(id)) return Response.json({ error: "Sesión no encontrada" }, { status: 404 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  return Response.json(updateSession(id, body.data));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  deleteSession(id);
  return new Response(null, { status: 204 });
}
