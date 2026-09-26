import { errorToMessage, getMessage, improveMessagePrompt } from "@/lib/chat";

export async function POST(_request: Request, ctx: RouteContext<"/api/messages/[id]/prompt">) {
  const { id } = await ctx.params;
  const message = getMessage(id);
  if (!message || message.role !== "user") return Response.json({ error: "Mensaje no encontrado" }, { status: 404 });

  try {
    return Response.json({ improvedPrompt: await improveMessagePrompt(id) });
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
