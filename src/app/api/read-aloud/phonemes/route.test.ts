// Route test (docs/platform/TESTING.md): validation and size limits; the model itself is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkPhonemes = vi.fn();
vi.mock("@/lib/phonemes", () => ({ checkPhonemes }));

const route = await import("@/app/api/read-aloud/phonemes/route");

beforeEach(() => {
  checkPhonemes.mockReset().mockResolvedValue({ status: "preparing", progress: null });
});

function post(fields: Record<string, string | Blob | undefined>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.set(key, value);
  return route.POST(new Request("http://test/api/read-aloud/phonemes", { method: "POST", body }));
}

const wav = () => new Blob([new Uint8Array(100)], { type: "audio/wav" });

describe("POST /api/read-aloud/phonemes", () => {
  it("passes the recording, the sentence and the transcript-based issues to the check", async () => {
    const res = await post({ audio: wav(), text: "I think so", transcript: "I sink so" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "preparing", progress: null });
    const [bytes, text, issues] = checkPhonemes.mock.calls[0];
    expect(bytes).toHaveLength(100);
    expect(text).toBe("I think so");
    expect(issues).toEqual([expect.objectContaining({ expected: "think", category: "th_sounds" })]);
  });

  it("answers 400 for missing or invalid fields", async () => {
    expect((await post({ text: "I think so", transcript: "x" })).status).toBe(400);
    expect((await post({ audio: wav(), transcript: "x" })).status).toBe(400);
    expect((await post({ audio: wav(), text: "  ", transcript: "x" })).status).toBe(400);
    expect((await post({ audio: new Blob([]), text: "hi", transcript: "x" })).status).toBe(400);
    expect(checkPhonemes).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that isn't a form", async () => {
    const res = await route.POST(new Request("http://test/x", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });

  it("answers 413 for an oversize body, even without Content-Length", async () => {
    const big = new Blob([new Uint8Array(1024 * 1024 + 64 * 1024)]);
    const res = await post({ audio: big, text: "hi", transcript: "x" });
    expect(res.status).toBe(413);
    const chunked = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(256 * 1024));
      },
    });
    const streamed = await route.POST(
      new Request("http://test/x", { method: "POST", body: chunked, duplex: "half" } as RequestInit),
    );
    expect(streamed.status).toBe(413);
    expect(checkPhonemes).not.toHaveBeenCalled();
  });
});
