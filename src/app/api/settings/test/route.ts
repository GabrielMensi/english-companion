import { generateText } from "ai";
import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { PROVIDER_IDS } from "@/lib/ai/provider-info";
import { resolveModel } from "@/lib/ai/providers";
import { getSettings } from "@/lib/settings";
import { parseBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.object({ provider: z.enum(PROVIDER_IDS) });

/** Sends a tiny request to one provider, with its saved key and model, to check the connection. */
export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid provider");
  if (!body.ok) return body.response;

  const started = Date.now();
  try {
    const { text } = await generateText({
      ...resolveModel(getSettings(userId), body.data.provider).call({ temperature: 0, retry: false }),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 20,
    });
    return Response.json({ ok: true, reply: text.trim(), ms: Date.now() - started });
  } catch (error) {
    logRouteError("POST /api/settings/test", error, 502);
    return Response.json({ ok: false, error: errorToMessage(error) }, { status: 502 });
  }
});
