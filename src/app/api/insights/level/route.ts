import { errorToMessage } from "@/lib/ai/fallback";
import { createLevelExplanation, getLevelData } from "@/lib/insights/insights";
import { logRouteError } from "@/lib/server-log";

export function GET() {
  return Response.json(getLevelData());
}

/** Asks the AI to explain the rule-based estimate (it never changes the level). */
export async function POST() {
  try {
    return Response.json(await createLevelExplanation());
  } catch (error) {
    logRouteError("POST /api/insights/level", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
}
