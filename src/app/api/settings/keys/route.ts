import { z } from "@/lib/zod";
import { providerStatus } from "@/lib/ai/providers";
import { KEY_PROVIDERS } from "@/lib/credentials";
import { setApiKey } from "@/lib/secrets";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({
  provider: z.enum(KEY_PROVIDERS),
  /** null removes the saved key (falls back to the environment variable, if any). */
  apiKey: z.string().trim().min(1).max(500).nullable(),
});

/** Saves or removes an API key. Responds with the masked status only, never the key. */
export const PUT = withUser(async (request: Request) => {
  const body = await parseBody(request, bodySchema, "Invalid API key");
  if (!body.ok) return body.response;

  setApiKey(body.data.provider, body.data.apiKey);
  return Response.json({ providers: providerStatus() });
});
