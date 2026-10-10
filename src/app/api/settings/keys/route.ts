import { z } from "zod";
import { providerStatus } from "@/lib/ai/providers";
import { KEY_PROVIDERS } from "@/lib/credentials";
import { setApiKey } from "@/lib/secrets";

const bodySchema = z.object({
  provider: z.enum(KEY_PROVIDERS),
  /** null removes the saved key (falls back to the environment variable, if any). */
  apiKey: z.string().trim().min(1).max(500).nullable(),
});

/** Saves or removes an API key. Responds with the masked status only, never the key. */
export async function PUT(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid API key" }, { status: 400 });

  setApiKey(body.data.provider, body.data.apiKey);
  return Response.json({ providers: providerStatus() });
}
