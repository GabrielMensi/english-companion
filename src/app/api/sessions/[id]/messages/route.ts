import { z } from "zod";
import { addUserMessage, analyzeStoredMessage, getMessages, getSession } from "@/lib/chat";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/messages">) {
  const { id } = await ctx.params;
  if (!getSession(id)) return Response.json({ error: "Chat not found" }, { status: 404 });
  return Response.json(getMessages(id));
}

const bodySchema = z.object({ text: z.string().trim().min(1).max(20_000) });

/** Stores the message, analyzes it and returns the resulting turn (message + reply). */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/messages">) {
  const { id } = await ctx.params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "The message is empty" }, { status: 400 });

  const message = addUserMessage(id, body.data.text);
  if (!message) return Response.json({ error: "Chat not found" }, { status: 404 });

  return Response.json(await analyzeStoredMessage(message.id));
}
