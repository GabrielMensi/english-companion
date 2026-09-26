import { errorToMessage } from "@/lib/ai/fallback";
import { getMessage, improveMessagePrompt } from "@/lib/chat";

export async function POST(_request: Request, ctx: RouteContext<"/api/messages/[id]/prompt">) {
  const { id } = await ctx.params;
  const message = getMessage(id);
  if (!message || message.role !== "user") return Response.json({ error: "Message not found" }, { status: 404 });

  try {
    return Response.json(await improveMessagePrompt(id));
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
