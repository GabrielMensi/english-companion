import { withUser } from "@/lib/auth/with-user";
import { createClassSession, getClassView } from "@/lib/class";
import { CEFR_LEVELS } from "@/lib/insights/level-core";
import { parseBody } from "@/lib/request-body";
import { z } from "@/lib/zod";

/** The classes with the teacher and what was loaded from each. */
export const GET = withUser(async (_request, _ctx, { userId }) => Response.json(getClassView(userId)));

const classBodySchema = z.object({
  heldAt: z.number().int().positive(),
  teacherLevel: z.enum(CEFR_LEVELS).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, classBodySchema, "Invalid class");
  if (!body.ok) return body.response;
  const { heldAt, teacherLevel, notes } = body.data;
  const row = createClassSession(userId, { heldAt, teacherLevel: teacherLevel ?? null, notes: notes || null });
  return Response.json({ id: row.id }, { status: 201 });
});
