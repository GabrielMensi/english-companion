import { withUser } from "@/lib/auth/with-user";
import { analyzeStoredMessage, getMessage } from "@/lib/chat";
import { turnStreamResponse, wantsTurnStream } from "@/lib/turn-stream";

/** Analyzes the message again; streamed like a new message with `Accept: application/x-ndjson`. */
export const POST = withUser(async (request: Request, ctx: RouteContext<"/api/messages/[id]/retry">, { userId }) => {
  const { id } = await ctx.params;
  const message = getMessage(userId, id);
  if (!message || message.role !== "user") return Response.json({ error: "Message not found" }, { status: 404 });
  if (wantsTurnStream(request)) return turnStreamResponse((onPreview) => analyzeStoredMessage(userId, id, onPreview));
  return Response.json(await analyzeStoredMessage(userId, id));
});
