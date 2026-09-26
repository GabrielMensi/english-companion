import { z } from "zod";
import { createSession, listSessions } from "@/lib/chat";

export async function GET() {
  return Response.json(listSessions());
}

const bodySchema = z.object({ mode: z.enum(["correction", "conversation"]).default("correction") });

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  return Response.json(createSession(body.data.mode), { status: 201 });
}
