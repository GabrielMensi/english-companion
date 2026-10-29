// Integration test (docs/platform/TESTING.md): the topic chat tools (feedback, phrases) on the real database.
import { beforeEach, describe, expect, it } from "vitest";

import { savePractice } from "@/lib/practice";
import { getVocabulary } from "@/lib/vocabulary";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedSession, seedUserMessage } from "@/test/db";

const feedbackRoute = await import("@/app/api/sessions/[id]/feedback/route");
const phrasesRoute = await import("@/app/api/sessions/[id]/phrases/route");

let user: TestUser;

beforeEach(async () => {
  resetDb();
  resetFakeAi({});
  user = await createTestUser();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (id: string, part: string) => `http://test/api/sessions/${id}/${part}`;

function topicChat() {
  const session = seedSession({ userId: user.id, mode: "conversation" });
  savePractice(user.id, session.id, { kind: "topic", preset: null, topic: "Interviews", tense: null });
  const tutor = db
    .insert(schema.messages)
    .values({
      id: "tutor-1",
      userId: user.id,
      sessionId: session.id,
      role: "assistant",
      content: "Could you walk me through your approach? Then explain how you keep the team up to speed.",
    })
    .returning()
    .get();
  return { session, tutor };
}

describe("errors the learner can fix are 400s and make no AI call", () => {
  it("a chat that is not a topic chat", async () => {
    const id = seedSession({ userId: user.id }).id;
    const feedback = await feedbackRoute.POST(user.request(url(id, "feedback"), { method: "POST" }), ctx(id));
    const suggest = await phrasesRoute.POST(user.request(url(id, "phrases"), { method: "POST" }), ctx(id));
    const save = await phrasesRoute.PUT(
      user.request(url(id, "phrases"), {
        method: "PUT",
        body: JSON.stringify({ phrases: [{ phrase: "walk me through", spanish: "x", messageId: "m" }] }),
      }),
      ctx(id),
    );
    expect([feedback.status, suggest.status, save.status]).toEqual([400, 400, 400]);
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
  });

  it("a topic chat with a single answer has nothing to review", async () => {
    const { session } = topicChat();
    seedUserMessage(session.id, { content: "I worked on payments." });
    const res = await feedbackRoute.POST(
      user.request(url(session.id, "feedback"), { method: "POST" }),
      ctx(session.id),
    );
    expect(res.status).toBe(400);
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
  });
});

describe("PUT /api/sessions/:id/phrases", () => {
  function save(sessionId: string, phrases: { phrase: string; spanish: string; messageId: string }[]) {
    return phrasesRoute.PUT(
      user.request(url(sessionId, "phrases"), { method: "PUT", body: JSON.stringify({ phrases }) }),
      ctx(sessionId),
    );
  }

  it("keeps every English phrase of the same Spanish meaning visible on the Vocabulary page", async () => {
    const { session, tutor } = topicChat();
    const res = await save(session.id, [
      { phrase: "walk me through", spanish: "Explicar", messageId: tutor.id },
      { phrase: "keep the team up to speed", spanish: "explicar", messageId: tutor.id },
    ]);
    expect(await res.json()).toEqual({ added: 2 });
    const again = await save(session.id, [{ phrase: "Walk me through", spanish: "explicar", messageId: tutor.id }]);
    expect(await again.json()).toEqual({ added: 0 });

    const words = getVocabulary(user.id);
    expect(words).toHaveLength(1);
    expect(words[0].english).toEqual(["walk me through", "keep the team up to speed"]);
    expect(words[0].contexts[0].sessionId).toBe(session.id);
  });

  it("only takes phrases from the tutor or the native version, as whole words", async () => {
    const { session, tutor } = topicChat();
    const mine = seedUserMessage(session.id, {
      content: "I explain the thing wrong",
      naturalText: "I explained it well",
    });
    const res = await save(session.id, [
      { phrase: "explain the thing wrong", spanish: "a", messageId: mine.id },
      { phrase: "explained it well", spanish: "b", messageId: mine.id },
      { phrase: "walk me", spanish: "c", messageId: tutor.id },
      { phrase: "peed", spanish: "d", messageId: tutor.id },
    ]);
    expect(await res.json()).toEqual({ added: 2 });
  });
});
