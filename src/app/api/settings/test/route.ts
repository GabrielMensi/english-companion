import { generateText } from "ai";
import { errorToMessage } from "@/lib/chat";
import { resolveModel } from "@/lib/ai/providers";
import { settingsSchema } from "@/lib/settings";

/** Sends a tiny request with the given (unsaved) settings to check the connection. */
export async function POST(request: Request) {
  const body = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid settings" }, { status: 400 });

  const started = Date.now();
  try {
    const { text } = await generateText({
      ...resolveModel(body.data).call({ temperature: 0 }),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 20,
    });
    return Response.json({ ok: true, reply: text.trim(), ms: Date.now() - started });
  } catch (error) {
    return Response.json({ ok: false, error: errorToMessage(error) }, { status: 502 });
  }
}
