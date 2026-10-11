import { setPrimary } from "@/lib/ai/fallback";
import { providerStatus } from "@/lib/ai/providers";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";
import { readJson } from "@/lib/request-body";

export async function GET() {
  const settings = getSettings();
  return Response.json({ settings, providers: providerStatus() });
}

/**
 * Partial update: the settings page saves each change as it happens, and the
 * chat header switches the primary model. Switching only the primary keeps the
 * previous one as the first fallback.
 */
export async function PATCH(request: Request) {
  const patch = settingsSchema.partial().safeParse(await readJson(request));
  if (!patch.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const current = getSettings();
  const chain = patch.data.provider && !patch.data.fallbacks ? setPrimary(current, patch.data.provider) : {};
  const merged = settingsSchema.safeParse({ ...current, ...patch.data, ...chain });
  if (!merged.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const settings = saveSettings(merged.data);
  return Response.json({ settings, providers: providerStatus() });
}
