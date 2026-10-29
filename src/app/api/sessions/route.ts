import { z } from "zod";
import { createSession, listSessions } from "@/lib/chat";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async (_request, _ctx, { userId }) => {
  return Response.json(listSessions(userId));
});

const bodySchema = z.object({ mode: z.enum(["correction", "conversation"]).default("correction") });

export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  const body = await parseBody(request, bodySchema, "Invalid data", { emptyAs: {} });
  if (!body.ok) return body.response;
  return Response.json(createSession(userId, body.data.mode), { status: 201 });
});
