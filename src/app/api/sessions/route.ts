import { z } from "zod";
import { createSession, listSessions } from "@/lib/chat";
import { readJson } from "@/lib/request-body";

export async function GET() {
  return Response.json(listSessions());
}

const bodySchema = z.object({ mode: z.enum(["correction", "conversation"]).default("correction") });

export async function POST(request: Request) {
  const body = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  return Response.json(createSession(body.data.mode), { status: 201 });
}
