import { z } from "zod";
import { createSession, listSessions } from "@/lib/chat";
import { parseBody } from "@/lib/request-body";

export async function GET() {
  return Response.json(listSessions());
}

const bodySchema = z.object({ mode: z.enum(["correction", "conversation"]).default("correction") });

export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema, "Invalid data", { emptyAs: {} });
  if (!body.ok) return body.response;
  return Response.json(createSession(body.data.mode), { status: 201 });
}
