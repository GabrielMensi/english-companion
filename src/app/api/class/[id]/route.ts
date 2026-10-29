import { withUser } from "@/lib/auth/with-user";
import { deleteClassSession, updateClassSession } from "@/lib/class";
import { cleanOrphanReviews } from "@/lib/flashcards-upkeep";
import { CEFR_LEVELS } from "@/lib/insights/level-core";
import { parseBody } from "@/lib/request-body";
import { z } from "@/lib/zod";

const patchSchema = z.object({
  heldAt: z.number().int().positive().optional(),
  teacherLevel: z.enum(CEFR_LEVELS).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Changes the date, the teacher's level or the notes of a class. */
export const PATCH = withUser(async (request: Request, ctx: RouteContext<"/api/class/[id]">, { userId }) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, patchSchema, "Invalid class");
  if (!body.ok) return body.response;
  const { notes, ...rest } = body.data;
  const row = updateClassSession(userId, id, { ...rest, ...(notes !== undefined && { notes: notes || null }) });
  if (!row) return Response.json({ error: "Class not found" }, { status: 404 });
  return Response.json({ id: row.id });
});

/** Deletes a class with everything loaded from it. */
export const DELETE = withUser(async (_request: Request, ctx: RouteContext<"/api/class/[id]">, { userId }) => {
  const { id } = await ctx.params;
  deleteClassSession(userId, id);
  // Its mistakes and words are gone: so are their flashcards.
  cleanOrphanReviews(userId);
  return new Response(null, { status: 204 });
});
