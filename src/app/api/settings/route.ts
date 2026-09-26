import { providerStatus } from "@/lib/ai/providers";
import { getSettings, saveSettings, settingsSchema } from "@/lib/settings";

export async function GET() {
  return Response.json({ settings: getSettings(), providers: providerStatus() });
}

export async function PUT(request: Request) {
  const body = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Configuración inválida" }, { status: 400 });
  return Response.json({ settings: saveSettings(body.data) });
}
