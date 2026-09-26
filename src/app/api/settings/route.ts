import { providerStatus } from "@/lib/ai/providers";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();
  return Response.json({ settings, providers: providerStatus(settings) });
}

export async function PUT(request: Request) {
  const body = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const settings = saveSettings(body.data);
  return Response.json({ settings, providers: providerStatus(settings) });
}

/** Partial update, e.g. switching the selected model from the chat header. */
export async function PATCH(request: Request) {
  const patch = settingsSchema.partial().safeParse(await request.json().catch(() => null));
  if (!patch.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const merged = settingsSchema.safeParse({ ...getSettings(), ...patch.data });
  if (!merged.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const settings = saveSettings(merged.data);
  return Response.json({ settings, providers: providerStatus(settings) });
}
