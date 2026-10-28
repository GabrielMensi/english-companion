import { z } from "zod";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { deleteCard, suspendCard, unsuspendCard } from "@/lib/flashcards-upkeep";
import { parseBody } from "@/lib/request-body";

const cardSchema = z.object({
  kind: z.enum(CARD_KINDS),
  key: z.string().min(1).max(2000),
});

/** Suspends a card (hides it from its deck) or brings it back. */
export async function PATCH(request: Request) {
  const body = await parseBody(request, cardSchema.extend({ suspended: z.boolean() }), "Invalid card");
  if (!body.ok) return body.response;
  const { kind, key, suspended } = body.data;
  if (suspended) suspendCard(kind, key);
  else unsuspendCard(kind, key);
  return new Response(null, { status: 204 });
}

/** Deletes a card at its source: the word's lookups, the mistake's corrections or the missed exercise item. */
export async function DELETE(request: Request) {
  const body = await parseBody(request, cardSchema, "Invalid card");
  if (!body.ok) return body.response;
  deleteCard(body.data.kind, body.data.key);
  return new Response(null, { status: 204 });
}
