import { withUser } from "@/lib/auth/with-user";
import { getClassSession, saveClassItems } from "@/lib/class";
import { classItemsSchema, normalizeClassImport } from "@/lib/class-core";
import { parseBody } from "@/lib/request-body";

/** Saves the reviewed corrections and words as "From class" (they count in the stats and feed the flashcards). */
export const POST = withUser(async (request: Request, ctx: RouteContext<"/api/class/[id]/items">, { userId }) => {
  const { id } = await ctx.params;
  const row = getClassSession(userId, id);
  if (!row) return Response.json({ error: "Class not found" }, { status: 404 });
  if (row.heldAt.getTime() > Date.now()) {
    return Response.json({ error: "That class hasn't happened yet" }, { status: 400 });
  }
  const body = await parseBody(request, classItemsSchema, "Invalid corrections");
  if (!body.ok) return body.response;
  const items = normalizeClassImport(body.data);
  if (items.corrections.length === 0 && items.words.length === 0) {
    return Response.json({ error: "There is nothing to save" }, { status: 400 });
  }
  return Response.json(saveClassItems(userId, id, { ...items, spokenWords: body.data.spokenWords }), { status: 201 });
});
