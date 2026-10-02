import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { createStudyPlan, REPORT_RANGES } from "@/lib/insights/insights";

const bodySchema = z.object({ range: z.enum(REPORT_RANGES).default("7") });

/** Writes (and saves) a study plan from the period's stats. */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Invalid period" }, { status: 400 });
  try {
    return Response.json(await createStudyPlan(body.data.range));
  } catch (error) {
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
