import { setPrimary } from "@/lib/ai/fallback";
import { providerStatus } from "@/lib/ai/providers";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async () => {
  const settings = getSettings();
  return Response.json({ settings, providers: providerStatus() });
});

/**
 * Partial update: the settings page saves each change as it happens, and the
 * chat header switches the primary model. Switching only the primary keeps the
 * previous one as the first fallback.
 */
export const PATCH = withUser(async (request: Request) => {
  const patch = await parseBody(request, settingsSchema.partial(), "Invalid settings");
  if (!patch.ok) return patch.response;
  const current = getSettings();
  const chain = patch.data.provider && !patch.data.fallbacks ? setPrimary(current, patch.data.provider) : {};
  const merged = settingsSchema.safeParse({ ...current, ...patch.data, ...chain });
  if (!merged.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const settings = saveSettings(merged.data);
  return Response.json({ settings, providers: providerStatus() });
});
