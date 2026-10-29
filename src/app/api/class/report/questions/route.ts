import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { createClassQuestions } from "@/lib/class-report";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({
  sinceId: z.string().max(100).nullish(),
  from: z.string().max(10).nullish(),
  to: z.string().max(10).nullish(),
});

/** Writes (and saves) "what to ask the teacher" for the report's period. */
export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid period", { emptyAs: {} });
  if (!body.ok) return body.response;
  try {
    return Response.json(await createClassQuestions(userId, body.data));
  } catch (error) {
    logRouteError("POST /api/class/report/questions", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
