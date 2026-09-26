import { analyzeStoredMessage, getMessage } from "@/lib/chat";

export async function POST(_request: Request, ctx: RouteContext<"/api/messages/[id]/retry">) {
  const { id } = await ctx.params;
  const message = getMessage(id);
  if (!message || message.role !== "user") return Response.json({ error: "Message not found" }, { status: 404 });
  return Response.json(await analyzeStoredMessage(id));
}
