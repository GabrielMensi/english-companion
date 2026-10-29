import { z } from "zod";
import { TENSES } from "@/lib/taxonomy";
import { setTopicTense } from "@/lib/practice";
import { deleteSession, getSession, updateSession } from "@/lib/chat";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["correction", "conversation"]).optional(),
  /** The tense a topic chat also practices, or null for none. */
  tense: z.enum(TENSES).nullable().optional(),
});

export const PATCH = withUser(async (request: Request, ctx: RouteContext<"/api/sessions/[id]">, { userId }) => {
  const { id } = await ctx.params;
  if (!getSession(userId, id)) return Response.json({ error: "Chat not found" }, { status: 404 });

  const body = await parseBody(request, bodySchema, "Invalid data");
  if (!body.ok) return body.response;
  const { tense, ...changes } = body.data;
  if (tense !== undefined && !setTopicTense(userId, id, tense)) {
    return Response.json({ error: "Only topic chats can practice a tense" }, { status: 400 });
  }
  return Response.json(updateSession(userId, id, changes));
});

export const DELETE = withUser(async (_request: Request, ctx: RouteContext<"/api/sessions/[id]">, { userId }) => {
  const { id } = await ctx.params;
  deleteSession(userId, id);
  // Its mistakes and words are gone: so are their flashcards.
  cleanOrphanReviews(userId);
  return new Response(null, { status: 204 });
});
