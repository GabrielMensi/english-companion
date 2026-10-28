import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_JSON_BYTES, parseBody, readBody, readJson } from "./request-body";

/** A request whose body arrives in chunks, without Content-Length (like a chunked upload). */
function chunkedRequest(chunks: Uint8Array[], onCancel?: () => void) {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel: onCancel,
  });
  return new Request("http://localhost/api", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readBody", () => {
  it("returns the whole body when it fits", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: "hello" });
    expect(new TextDecoder().decode((await readBody(request, 5))!)).toBe("hello");
  });

  it("refuses a declared Content-Length over the limit without reading the body", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: "hello",
      headers: { "content-length": "999999" },
    });
    expect(await readBody(request, 10)).toBeNull();
    expect(request.bodyUsed).toBe(false);
  });

  it("stops reading a chunked body as soon as it passes the limit", async () => {
    let cancelled = false;
    const request = chunkedRequest([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)], () => {
      cancelled = true;
    });
    expect(await readBody(request, 6)).toBeNull();
    expect(cancelled).toBe(true);
  });

  it("joins the chunks of a body that fits", async () => {
    const request = chunkedRequest([Uint8Array.of(1, 2), Uint8Array.of(3)]);
    expect(Array.from((await readBody(request, 3))!)).toEqual([1, 2, 3]);
  });

  it("returns an empty body when there is none", async () => {
    expect(await readBody(new Request("http://localhost/api", { method: "POST" }), 10)).toEqual(new Uint8Array(0));
  });
});

describe("readJson", () => {
  const post = (body: string) => new Request("http://localhost/api", { method: "POST", body });

  it("parses valid JSON", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it("returns null for invalid, empty or oversized bodies", async () => {
    expect(await readJson(post("{nope"))).toBeNull();
    expect(await readJson(new Request("http://localhost/api", { method: "POST" }))).toBeNull();
    expect(await readJson(post('{"a":"long enough"}'), 5)).toBeNull();
  });
});

describe("parseBody", () => {
  const schema = z.object({ n: z.number() });
  const post = (body?: string) => new Request("http://localhost/api", { method: "POST", body });

  it("returns the validated data", async () => {
    const result = await parseBody(post('{"n":1}'), schema, "Bad");
    expect(result).toEqual({ ok: true, data: { n: 1 } });
  });

  it("answers 400 with the message for invalid or missing bodies", async () => {
    for (const body of ['{"n":"x"}', "not json", undefined]) {
      const result = await parseBody(post(body), schema, "Bad");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({ error: "Bad" });
      }
    }
  });

  it("answers 400 for a body over the limit", async () => {
    const big = JSON.stringify({ n: 1, pad: "x".repeat(MAX_JSON_BYTES) });
    expect((await parseBody(post(big), schema, "Bad")).ok).toBe(false);
  });

  it("uses emptyAs when the body is missing", async () => {
    const result = await parseBody(post(), z.object({ a: z.string().default("d") }), "Bad", { emptyAs: {} });
    expect(result).toEqual({ ok: true, data: { a: "d" } });
  });

  it("gives the schema null when the body is missing and emptyAs isn't set", async () => {
    const result = await parseBody(post(), z.object({ reason: z.string() }).nullable(), "Bad");
    expect(result).toEqual({ ok: true, data: null });
  });
});
