import { type ChatMessage, TURN_STREAM_TYPE, type TurnEvent } from "@/lib/types";

/** Tiny fetch wrapper for client components: throws with the server's error message. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

/** Splits a byte stream into lines, however the chunks happen to be cut. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) if (line.trim()) yield line;
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer;
}

/**
 * Posts to a route that analyzes a message and reads the streamed turn: `onEvent` gets the stored
 * message and the previews, and the saved turn is returned. Throws with the server's error message.
 */
export async function streamTurn(
  url: string,
  body: unknown,
  onEvent: (event: Exclude<TurnEvent, { type: "done" | "error" }>) => void,
): Promise<ChatMessage[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: TURN_STREAM_TYPE, ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  // A server that doesn't stream answers with the turn as plain JSON.
  if (!res.headers.get("content-type")?.includes(TURN_STREAM_TYPE)) return (await res.json()) as ChatMessage[];

  for await (const line of readLines(res.body)) {
    const event = JSON.parse(line) as TurnEvent;
    if (event.type === "done") return event.turn;
    if (event.type === "error") throw new Error(event.error);
    onEvent(event);
  }
  throw new Error("Lost the connection while correcting. Reload the page to see the result.");
}
