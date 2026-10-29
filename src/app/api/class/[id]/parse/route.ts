import { z } from "zod";
import { structureClassNotes } from "@/lib/ai/class";
import { errorToMessage } from "@/lib/ai/fallback";
import { getClassSession } from "@/lib/class";
import { MAX_CLASS_TEXT } from "@/lib/class-core";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { getSettings } from "@/lib/settings";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({ text: z.string().trim().min(1).max(MAX_CLASS_TEXT) });

/** Structures the learner's notes of the teacher's corrections with the fixed taxonomy. Saves nothing. */
export const POST = withUser(async (request: Request, ctx: RouteContext<"/api/class/[id]/parse">, { userId }) => {
  const { id } = await ctx.params;
  if (!getClassSession(userId, id)) return Response.json({ error: "Class not found" }, { status: 404 });
  const body = await parseBody(request, bodySchema, `Paste the notes (up to ${MAX_CLASS_TEXT} characters)`);
  if (!body.ok) return body.response;
  try {
    const { items } = await structureClassNotes(body.data.text, getSettings(userId));
    return Response.json(items);
  } catch (error) {
    logRouteError("POST /api/class/[id]/parse", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
