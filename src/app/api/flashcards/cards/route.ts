import { z } from "zod";
import { CARD_KINDS } from "@/lib/flashcards-core";
import { deleteCard, suspendCard, unsuspendCard } from "@/lib/flashcards-upkeep";

const cardSchema = z.object({
  kind: z.enum(CARD_KINDS),
  key: z.string().min(1).max(2000),
});

/** Suspends a card (hides it from its deck) or brings it back. */
export async function PATCH(request: Request) {
  const body = cardSchema.extend({ suspended: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid card" }, { status: 400 });
  const { kind, key, suspended } = body.data;
  if (suspended) suspendCard(kind, key);
  else unsuspendCard(kind, key);
  return new Response(null, { status: 204 });
}

/** Deletes a card at its source: the word's lookups or the mistake's corrections. */
export async function DELETE(request: Request) {
  const body = cardSchema
    .extend({ kind: z.enum(["vocabulary", "mistake"]) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid card" }, { status: 400 });
  deleteCard(body.data.kind, body.data.key);
  return new Response(null, { status: 204 });
}
