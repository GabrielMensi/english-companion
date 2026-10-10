/**
 * Reading request bodies with a size limit (no server-only imports, unit tested). Route handlers
 * have no body limit of their own, so `request.json()` or `request.arrayBuffer()` would buffer
 * whatever a client sends.
 */

/** Enough for any JSON body the app sends (the largest is a 20,000-character message with its transcript). */
export const MAX_JSON_BYTES = 1024 * 1024;

/**
 * The whole body, or null when it's bigger than `maxBytes`. A declared Content-Length over the
 * limit is refused before reading anything; otherwise reading stops as soon as the limit is passed.
 */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

/** The parsed JSON body, or null when it's missing, invalid or too big. */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const body = await readBody(request, maxBytes);
  if (!body) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}
