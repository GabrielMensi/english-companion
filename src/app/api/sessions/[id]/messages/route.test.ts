// Integration test (docs/platform/TESTING.md): the real route handlers, chat logic and migrations on a
// throwaway SQLite file, with the providers replaced by the AI SDK's mock models (src/test/setup.ts).
// Never calls a real API.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Analysis } from "@/lib/ai/analysis";
import type { ChatMessage, TurnEvent } from "@/lib/types";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";

const sessions = await import("@/app/api/sessions/route");
const messages = await import("@/app/api/sessions/[id]/messages/route");

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

// Longer than the SDK's retry delays (2 s, then 4 s), shorter than the classification timer (5 min).
const BACKOFF_MS = 30_000;

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser();
});

beforeEach(() => resetFakeAi(ANALYSIS));
afterEach(() => vi.useRealTimers());

async function newSession(mode: "correction" | "conversation" = "conversation"): Promise<string> {
  const res = await sessions.POST(
    user.request("http://test/api/sessions", { method: "POST", body: JSON.stringify({ mode }) }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function send(sessionId: string, body: unknown, headers: Record<string, string> = {}) {
  const request = user.request(`http://test/api/sessions/${sessionId}/messages`, {
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
    const stored = (await (
      await messages.GET(user.request("http://test"), { params: Promise.resolve({ id }) })
    ).json()) as ChatMessage[];
    expect(stored.map((m) => m.id)).toEqual([message.id, reply.id]);
  });

  it("falls back to the next provider when the selected one fails", async () => {
    fakeAi.gemini.fail = "quota";
    const [message] = (await (
      await send(await newSession(), { text: "I go to the park yesterday." })
    ).json()) as ChatMessage[];
    expect(message).toMatchObject({ status: "done", provider: "groq" });
    expect(message.fallbackAttempts).toHaveLength(1);
  });

  it("keeps the message with an error when every provider fails", async () => {
    fakeAi.gemini.fail = "quota";
    fakeAi.groq.fail = "quota";
    const [message] = (await (await send(await newSession(), { text: "Hello" })).json()) as ChatMessage[];
    expect(message.status).toBe("error");
    expect(message.errorMessage).toBeTruthy();
  });

  it("retries a retryable error on the last provider with backoff, then gives up", async () => {
    const id = await newSession();
    vi.useFakeTimers();
    fakeAi.gemini.fail = "quota";
    fakeAi.groq.fail = "unavailable-retryable";
    const pending = send(id, { text: "Hello" });
    // The session check runs first, in real time: wait for the first request before skipping the backoff.
    await vi.waitFor(() => expect(fakeAi.groq.calls).toBe(1));
    // The SDK waits between retries; fake timers skip it. Not runAllTimers: the 5-minute timer of the
    // deferred classification would fire too.
    await vi.advanceTimersByTimeAsync(BACKOFF_MS);
    const [message] = (await (await pending).json()) as ChatMessage[];

    expect(message.status).toBe("error");
    // Only the last provider retries: the first request + 2 retries.
    expect(fakeAi.gemini.calls).toBe(1);
    expect(fakeAi.groq.calls).toBe(3);
  });

  it("recovers when the last provider's retry succeeds", async () => {
    const id = await newSession();
    vi.useFakeTimers();
    fakeAi.gemini.fail = "quota";
    fakeAi.groq.fail = "unavailable-retryable";
    const pending = send(id, { text: "Hello" });
    // Let the first failed attempt happen (the session check comes first, in real time), then the provider comes back.
    await vi.waitFor(() => expect(fakeAi.groq.calls).toBe(1));
    fakeAi.groq.fail = false;
    await vi.advanceTimersByTimeAsync(BACKOFF_MS);
    const [message] = (await (await pending).json()) as ChatMessage[];
    // The second request, after the backoff, is the one that worked.
    expect(fakeAi.groq.calls).toBe(2);

    expect(message).toMatchObject({ status: "done", provider: "groq" });
  });

  it("streams previews as NDJSON and ends with the saved turn", async () => {
    const res = await send(
      await newSession(),
      { text: "I go to the park yesterday." },
      { Accept: "application/x-ndjson" },
    );
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
