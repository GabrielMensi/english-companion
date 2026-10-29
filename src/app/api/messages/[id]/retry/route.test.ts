// Integration test (docs/platform/TESTING.md): retrying a message replaces its previous result.
import { beforeEach, describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/ai/analysis";
import type { ChatMessage } from "@/lib/types";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedCorrection, seedSession, seedUserMessage } from "@/test/db";

const retry = await import("@/app/api/messages/[id]/retry/route");

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
      explanation: "Yesterday is past: use the past simple.",
    },
  ],
  spanishPhrases: [],
  reply: "Nice! What did you do there?",
};

let user: TestUser;

beforeEach(async () => {
  resetDb();
  resetFakeAi(ANALYSIS);
  user = await createTestUser();
});

function post(id: string, headers: Record<string, string> = {}) {
  return retry.POST(user.request(`http://test/api/messages/${id}/retry`, { method: "POST", headers }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/messages/[id]/retry", () => {
  it("re-analyzes a failed message and replaces what was stored", async () => {
    const session = seedSession({ userId: user.id, mode: "conversation" });
    const failed = seedUserMessage(session.id, { status: "error", errorMessage: "All models failed" });
    // A leftover from an earlier attempt must not survive the retry.
    seedCorrection(failed.id, { original: "old", correction: "older" });

    const res = await post(failed.id);
    expect(res.status).toBe(200);
    const [message, reply] = (await res.json()) as ChatMessage[];
    expect(message).toMatchObject({ id: failed.id, status: "done", errorMessage: null, provider: "gemini" });
    expect(message.corrections.map((c) => c.original)).toEqual(["I go"]);
    expect(reply).toMatchObject({ role: "assistant", content: ANALYSIS.reply });
    expect(db.select().from(schema.corrections).all()).toHaveLength(1);
  });

  it("keeps the message as an error when every provider fails again", async () => {
    fakeAi.gemini.fail = "quota";
    fakeAi.groq.fail = "unavailable";
    const failed = seedUserMessage(seedSession({ userId: user.id }).id, { status: "error" });

    const [message] = (await (await post(failed.id)).json()) as ChatMessage[];
    expect(message.status).toBe("error");
    expect(message.errorMessage).toBeTruthy();
  });

  it("streams the retry as NDJSON", async () => {
    const message = seedUserMessage(seedSession({ userId: user.id }).id, { status: "error" });
    const res = await post(message.id, { Accept: "application/x-ndjson" });
    const events = (await res.text()).trim().split("\n");
    expect(events.length).toBeGreaterThan(1);
    expect(JSON.parse(events.at(-1) ?? "{}")).toMatchObject({ type: "done" });
  });

  it("answers 404 for a missing message and for an assistant message", async () => {
    expect((await post("missing")).status).toBe(404);
    const session = seedSession({ userId: user.id });
    const reply = seedUserMessage(session.id, { role: "assistant", content: "Hi" });
    expect((await post(reply.id)).status).toBe(404);
  });
});
