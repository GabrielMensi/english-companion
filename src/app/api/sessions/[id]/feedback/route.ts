import { errorToMessage } from "@/lib/ai/fallback";
import { getSession } from "@/lib/chat";
import { logRouteError } from "@/lib/server-log";
import { createFeedback } from "@/lib/topic-review";
import { TopicToolError } from "@/lib/topic-review-core";
import { withUser } from "@/lib/auth/with-user";

/** Writes (and saves) the end-of-conversation review of a topic chat, from its real messages and corrections. */
export const POST = withUser(
  async (_request: Request, ctx: RouteContext<"/api/sessions/[id]/feedback">, { userId }) => {
    const { id } = await ctx.params;
    if (!getSession(userId, id)) return Response.json({ error: "Chat not found" }, { status: 404 });
    try {
      return Response.json(await createFeedback(userId, id));
    } catch (error) {
      if (error instanceof TopicToolError) return Response.json({ error: error.message }, { status: 400 });
      logRouteError("POST /api/sessions/[id]/feedback", error, 502);
      return Response.json({ error: errorToMessage(error) }, { status: 502 });
    }
  },
);
