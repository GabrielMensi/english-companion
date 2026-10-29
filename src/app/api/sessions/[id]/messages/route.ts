import { z } from "zod";
import { addUserMessage, analyzeStoredMessage, getMessage, getMessages, getSession } from "@/lib/chat";
import { FLUENCY_VERSION } from "@/lib/fluency";
import { turnStreamResponse, wantsTurnStream } from "@/lib/turn-stream";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async (_request: Request, ctx: RouteContext<"/api/sessions/[id]/messages">, { userId }) => {
  const { id } = await ctx.params;
  if (!getSession(userId, id)) return Response.json({ error: "Chat not found" }, { status: 404 });
  return Response.json(getMessages(userId, id));
});

const bodySchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  /** Present when the message was dictated. */
  voice: z
    .object({
      transcriptRaw: z.string().max(20_000),
      transcriptEdited: z.boolean(),
      transcriptionProvider: z.string().max(40),
      transcriptionModel: z.string().max(100),
      audioDurationMs: z.number().int().nonnegative(),
      fluency: z
        .object({
          version: z.literal(FLUENCY_VERSION),
          words: z.number().int().nonnegative(),
          speechMs: z.number().int().nonnegative(),
          pauses: z.number().int().nonnegative(),
          pauseMs: z.number().int().nonnegative(),
          longestPauseMs: z.number().int().nonnegative(),
          fillers: z.record(z.string().max(20), z.number().int().nonnegative()),
        })
        .nullable()
        .default(null),
    })
    .optional(),
});

/**
 * Stores the message, analyzes it and returns the resulting turn (message + reply). With
 * `Accept: application/x-ndjson` the analysis is streamed while it's generated.
 */
export const POST = withUser(async (request: Request, ctx: RouteContext<"/api/sessions/[id]/messages">, { userId }) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, bodySchema, "The message is empty");
  if (!body.ok) return body.response;

  const message = addUserMessage(userId, id, body.data.text, body.data.voice);
  if (!message) return Response.json({ error: "Chat not found" }, { status: 404 });

  if (wantsTurnStream(request)) {
    return turnStreamResponse((onPreview) => analyzeStoredMessage(userId, message.id, onPreview), {
      type: "message",
      message: getMessage(userId, message.id)!,
    });
  }
  return Response.json(await analyzeStoredMessage(userId, message.id));
});
