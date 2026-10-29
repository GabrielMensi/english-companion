import { z } from "@/lib/zod";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { deleteCard, suspendCard, unsuspendCard } from "@/lib/flashcards-upkeep";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

const cardSchema = z.object({
  kind: z.enum(CARD_KINDS),
  key: z.string().min(1).max(2000),
});

/** Suspends a card (hides it from its deck) or brings it back. */
export const PATCH = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, cardSchema.extend({ suspended: z.boolean() }), "Invalid card");
  if (!body.ok) return body.response;
  const { kind, key, suspended } = body.data;
  if (suspended) suspendCard(userId, kind, key);
  else unsuspendCard(userId, kind, key);
  return new Response(null, { status: 204 });
});

/** Deletes a card at its source: the word's lookups, the mistake's corrections or the missed exercise item. */
export const DELETE = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, cardSchema, "Invalid card");
  if (!body.ok) return body.response;
  deleteCard(userId, body.data.kind, body.data.key);
  return new Response(null, { status: 204 });
});
