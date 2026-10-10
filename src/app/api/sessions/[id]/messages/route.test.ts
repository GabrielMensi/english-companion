// Integration test (docs/platform/TESTING.md): the real route handlers, chat logic and migrations on a
// throwaway SQLite file, with the providers replaced by the AI SDK's mock models. Never calls a real API.
import { APICallError } from "ai";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Analysis } from "@/lib/ai/analysis";
import type { ChatMessage, TurnEvent } from "@/lib/types";

const env = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "companion-test-"));
  // Read when "@/db" is first imported, so it must be set before any import below runs.
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-gemini-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  return { dir, rmSync: fs.rmSync };
});

// What each provider answers; the tests set them.
const ai = vi.hoisted(() => ({
  gemini: { output: null as Analysis | null, fail: false },
  groq: { output: null as Analysis | null, fail: false },
}));

vi.mock("server-only", () => ({}));

async function mockModel(provider: "gemini" | "groq", modelId: string) {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const answer = () => {
    if (ai[provider].fail) {
      // Not retryable, so the last provider fails right away instead of retrying with backoff.
      throw new APICallError({
        message: "Quota exceeded",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: false,
      });
    }
    return JSON.stringify(ai[provider].output);
  };
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  };
  const finishReason = { unified: "stop" as const, raw: undefined };
  return new MockLanguageModelV4({
    provider,
    modelId,
    doGenerate: async () => ({ content: [{ type: "text", text: answer() }], finishReason, usage, warnings: [] }),
    doStream: async () => {
      const text = answer();
      // Split the JSON in two so the route streams at least one partial preview.
      const half = Math.floor(text.length / 2);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "1" },
            { type: "text-delta" as const, id: "1", delta: text.slice(0, half) },
            { type: "text-delta" as const, id: "1", delta: text.slice(half) },
            { type: "text-end" as const, id: "1" },
            { type: "finish" as const, finishReason, usage },
          ],
        }),
      };
    },
  });
}

vi.mock("@ai-sdk/google", async () => {
  const model = await mockModel("gemini", "mock-gemini");
  return { createGoogleGenerativeAI: () => () => model };
});
vi.mock("@ai-sdk/groq", async () => {
  const model = await mockModel("groq", "mock-groq");
  return { createGroq: () => () => model };
});

const sessions = await import("@/app/api/sessions/route");
const messages = await import("@/app/api/sessions/[id]/messages/route");

afterAll(() => {
  const g = globalThis as { __sqlite?: { close(): void } };
  g.__sqlite?.close();
  delete g.__sqlite;
  env.rmSync(env.dir, { recursive: true, force: true });
});

const ANALYSIS: Analysis = {
  correctedText: "I went to the park yesterday.",
  naturalText: null,
  errors: [
    {
      original: "I go",
      correction: "I went",
      category: "verb_tense",
      subcategory: "past_simple",
      severity: "moderate",
      explanation: "Ayer es pasado: usá el past simple.",
    },
  ],
  spanishPhrases: [],
  reply: "Nice! What did you do there?",
};

beforeEach(() => {
  ai.gemini = { output: ANALYSIS, fail: false };
  ai.groq = { output: ANALYSIS, fail: false };
});

async function newSession(mode: "correction" | "conversation" = "conversation"): Promise<string> {
  const res = await sessions.POST(new Request("http://test/api/sessions", { method: "POST", body: JSON.stringify({ mode }) }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function send(sessionId: string, body: unknown, headers: Record<string, string> = {}) {
  const request = new Request(`http://test/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return messages.POST(request, { params: Promise.resolve({ id: sessionId }) });
}

describe("POST /api/sessions/[id]/messages", () => {
  it("saves the correction and the reply", async () => {
    const id = await newSession();
    const res = await send(id, { text: "I go to the park yesterday." });
    expect(res.status).toBe(200);

    const [message, reply] = (await res.json()) as ChatMessage[];
    expect(message).toMatchObject({ status: "done", correctedText: ANALYSIS.correctedText, provider: "gemini" });
    expect(message.corrections).toHaveLength(1);
    expect(message.corrections[0]).toMatchObject({ category: "verb_tense", original: "I go" });
    expect(reply).toMatchObject({ role: "assistant", content: ANALYSIS.reply });

    // And it's what a reload of the chat shows.
    const stored = (await (await messages.GET(new Request("http://test"), { params: Promise.resolve({ id }) })).json()) as ChatMessage[];
    expect(stored.map((m) => m.id)).toEqual([message.id, reply.id]);
  });

  it("falls back to the next provider when the selected one fails", async () => {
    ai.gemini.fail = true;
    const [message] = (await (await send(await newSession(), { text: "I go to the park yesterday." })).json()) as ChatMessage[];
    expect(message).toMatchObject({ status: "done", provider: "groq" });
    expect(message.fallbackAttempts).toHaveLength(1);
  });

  it("keeps the message with an error when every provider fails", async () => {
    ai.gemini.fail = true;
    ai.groq.fail = true;
    const [message] = (await (await send(await newSession(), { text: "Hello" })).json()) as ChatMessage[];
    expect(message.status).toBe("error");
    expect(message.errorMessage).toBeTruthy();
  });

  it("streams previews as NDJSON and ends with the saved turn", async () => {
    const res = await send(await newSession(), { text: "I go to the park yesterday." }, { Accept: "application/x-ndjson" });
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as TurnEvent);

    expect(events[0].type).toBe("message");
    expect(events.some((e) => e.type === "preview")).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.turn[0].corrections).toHaveLength(1);
  });

  it("rejects empty and oversized messages", async () => {
    const id = await newSession();
    expect((await send(id, { text: "   " })).status).toBe(400);
    expect((await send(id, { text: "a".repeat(20_001) })).status).toBe(400);
  });

  it("answers 404 for a chat that doesn't exist", async () => {
    expect((await send("missing", { text: "Hello" })).status).toBe(404);
  });
});
