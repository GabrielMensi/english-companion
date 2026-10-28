import { analyzeStoredMessage, getMessage } from "@/lib/chat";
import { turnStreamResponse, wantsTurnStream } from "@/lib/turn-stream";
import { withUser } from "@/lib/auth/with-user";

/** Analyzes the message again; streamed like a new message with `Accept: application/x-ndjson`. */
export const POST = withUser(async (request: Request, ctx: RouteContext<"/api/messages/[id]/retry">) => {
  const { id } = await ctx.params;
  const message = getMessage(id);
  if (!message || message.role !== "user") return Response.json({ error: "Message not found" }, { status: 404 });
  if (wantsTurnStream(request)) return turnStreamResponse((onPreview) => analyzeStoredMessage(id, onPreview));
  return Response.json(await analyzeStoredMessage(id));
});
