import type { NextRequest } from "next/server";
import { errorToMessage } from "@/lib/ai/fallback";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/provider-info";
import { listModels } from "@/lib/ai/providers";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const provider = params.get("provider") as ProviderId | null;
  if (!provider || !PROVIDER_IDS.includes(provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }

  try {
    return Response.json({ models: await listModels(provider) });
  } catch (error) {
    logRouteError("GET /api/models (listing models)", error);
    return Response.json({ models: [], error: errorToMessage(error) });
  }
});
