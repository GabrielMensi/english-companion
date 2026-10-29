import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { createStudyPlan, REPORT_RANGES } from "@/lib/insights/insights";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({ range: z.enum(REPORT_RANGES).default("7") });

/** Writes (and saves) a study plan from the period's stats. */
export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid period", { emptyAs: {} });
  if (!body.ok) return body.response;
  try {
    return Response.json(await createStudyPlan(userId, body.data.range));
  } catch (error) {
    logRouteError("POST /api/insights/plan", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
