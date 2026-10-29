import { errorToMessage } from "@/lib/ai/fallback";
import { getMessage, improveMessagePrompt } from "@/lib/chat";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

export const POST = withUser(async (_request: Request, ctx: RouteContext<"/api/messages/[id]/prompt">, { userId }) => {
  const { id } = await ctx.params;
  const message = getMessage(userId, id);
  if (!message || message.role !== "user") return Response.json({ error: "Message not found" }, { status: 404 });

  try {
    return Response.json(await improveMessagePrompt(userId, id));
  } catch (error) {
    logRouteError("POST /api/messages/[id]/prompt", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
