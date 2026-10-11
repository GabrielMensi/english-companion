import "server-only";

import type { OnPreview } from "@/lib/ai/analyze";
import { errorToMessage } from "@/lib/ai/fallback";
import { type ChatMessage, TURN_STREAM_TYPE, type TurnEvent } from "@/lib/types";

/** Whether the client asked for the streamed version of a turn. */
export function wantsTurnStream(request: Request): boolean {
  return request.headers.get("accept")?.includes(TURN_STREAM_TYPE) ?? false;
}

/**
 * Streams a turn as newline-delimited JSON (see {@link TurnEvent}). The analysis keeps running and
 * gets saved even if the client goes away, as it does without streaming.
 */
export function turnStreamResponse(run: (onPreview: OnPreview) => Promise<ChatMessage[]>, first?: TurnEvent): Response {
  const encoder = new TextEncoder();
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // The client disconnected.
        }
      };

      if (first) send(first);
      try {
        send({ type: "done", turn: await run((preview) => send({ type: "preview", preview })) });
      } catch (error) {
        send({ type: "error", error: errorToMessage(error) });
      }
      if (open) controller.close();
    },
    cancel() {
      open = false;
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": `${TURN_STREAM_TYPE}; charset=utf-8`,
      // no-transform keeps compression from buffering the chunks.
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
