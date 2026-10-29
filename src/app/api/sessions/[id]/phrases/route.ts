import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { getSession } from "@/lib/chat";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { createPhraseSuggestions, savePhrases } from "@/lib/topic-review";
import { withUser } from "@/lib/auth/with-user";

/** Suggests useful phrases from a topic chat. Nothing is saved until the learner picks some (PUT). */
export const POST = withUser(async (_request: Request, ctx: RouteContext<"/api/sessions/[id]/phrases">, { userId }) => {
  const { id } = await ctx.params;
  if (!getSession(userId, id)) return Response.json({ error: "Chat not found" }, { status: 404 });
  try {
    return Response.json(await createPhraseSuggestions(userId, id));
  } catch (error) {
    logRouteError("POST /api/sessions/[id]/phrases", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});

const bodySchema = z.object({
  phrases: z
    .array(z.object({ phrase: z.string().max(100), spanish: z.string().max(200), messageId: z.string().max(100) }))
    .min(1)
    .max(20),
});

/** Saves the picked phrases to the Vocabulary page. */
export const PUT = withUser(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/phrases">, { userId }) => {
  const { id } = await ctx.params;
  if (!getSession(userId, id)) return Response.json({ error: "Chat not found" }, { status: 404 });
  const body = await parseBody(request, bodySchema, "Invalid data");
  if (!body.ok) return body.response;
  try {
    return Response.json({ added: savePhrases(userId, id, body.data.phrases) });
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 400 });
  }
});
