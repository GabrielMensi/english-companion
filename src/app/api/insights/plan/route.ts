import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { createStudyPlan, REPORT_RANGES } from "@/lib/insights/insights";
import { parseBody } from "@/lib/request-body";

const bodySchema = z.object({ range: z.enum(REPORT_RANGES).default("7") });

/** Writes (and saves) a study plan from the period's stats. */
export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema, "Invalid period", { emptyAs: {} });
  if (!body.ok) return body.response;
  try {
    return Response.json(await createStudyPlan(body.data.range));
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
