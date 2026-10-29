import { errorToMessage } from "@/lib/ai/fallback";
import { createLevelExplanation, getLevelData } from "@/lib/insights/insights";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async (_request, _ctx, { userId }) => {
  return Response.json(getLevelData(userId));
});

/** Asks the AI to explain the rule-based estimate (it never changes the level). */
export const POST = withUser(async (_request, _ctx, { userId }) => {
  try {
    return Response.json(await createLevelExplanation(userId));
  } catch (error) {
    logRouteError("POST /api/insights/level", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
