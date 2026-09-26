import type { NextRequest } from "next/server";
import { errorToMessage } from "@/lib/chat";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/provider-info";
import { listModels } from "@/lib/ai/providers";

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") as ProviderId | null;
  if (!provider || !PROVIDER_IDS.includes(provider)) {
    return Response.json({ error: "Proveedor inválido" }, { status: 400 });
  }
  try {
    return Response.json({ models: await listModels(provider) });
  } catch (error) {
    return Response.json({ models: [], error: errorToMessage(error) });
  }
}
