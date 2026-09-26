import type { NextRequest } from "next/server";
import { errorToMessage } from "@/lib/chat";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/provider-info";
import { listModels } from "@/lib/ai/providers";
import { getSettings, settingsSchema } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const provider = params.get("provider") as ProviderId | null;
  if (!provider || !PROVIDER_IDS.includes(provider)) {
    return Response.json({ error: "Proveedor inválido" }, { status: 400 });
  }

  // Lets the settings page list Ollama models for a URL that isn't saved yet.
  const baseUrl = settingsSchema.shape.ollamaBaseUrl.safeParse(params.get("ollamaBaseUrl"));
  const settings = { ...getSettings(), ...(baseUrl.success && baseUrl.data ? { ollamaBaseUrl: baseUrl.data } : {}) };

  try {
    return Response.json({ models: await listModels(provider, settings) });
  } catch (error) {
    return Response.json({ models: [], error: errorToMessage(error) });
  }
}
