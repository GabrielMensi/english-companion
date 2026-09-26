import { providerStatus } from "@/lib/ai/providers";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();
  return Response.json({ settings, providers: providerStatus(settings) });
}

export async function PUT(request: Request) {
  const body = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Configuración inválida" }, { status: 400 });
  const settings = saveSettings(body.data);
  return Response.json({ settings, providers: providerStatus(settings) });
}
