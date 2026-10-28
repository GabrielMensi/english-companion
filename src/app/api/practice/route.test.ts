// Integration test (docs/platform/TESTING.md): starting a practice chat creates a session and its opening message.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";

const practice = await import("@/app/api/practice/route");

const EXERCISES = {
  items: [
    {
      sentence: "I ___ (live) here since 2020.",
      answer: "I have lived here since 2020.",
      why: "Since: present perfect.",
    },
    {
      sentence: "She ___ (work) here for years.",
      answer: "She has worked here for years.",
      why: "For: present perfect.",
    },
    {
      sentence: "They ___ (know) him since May.",
      answer: "They have known him since May.",
      why: "Since: present perfect.",
    },
  ],
};

let user: TestUser;

beforeEach(async () => {
  resetDb();
  resetFakeAi(EXERCISES);
  user = await createTestUser();
});

function start(body: unknown) {
  return practice.POST(user.request("http://test/api/practice", { method: "POST", body: JSON.stringify(body) }));
}

function openingOf(sessionId: string) {
  return db.select().from(schema.messages).where(eq(schema.messages.sessionId, sessionId)).all();
}

describe("POST /api/practice", () => {
  it("needs a session", async () => {
    const res = await practice.POST(new Request("http://test/api/practice", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("starts a tense conversation without calling the AI", async () => {
    const res = await start({ kind: "conversation", tense: "past_simple" });
    expect(res.status).toBe(201);
    const session = (await res.json()) as { id: string; mode: string };

    expect(session.mode).toBe("conversation");
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
    const [opening] = openingOf(session.id);
    expect(opening).toMatchObject({ role: "assistant", provider: null });
    expect(opening.content.length).toBeGreaterThan(0);
  });

  it("generates exercises with the AI and shows them in the opening message", async () => {
    const res = await start({ kind: "form", tense: "present_perfect" });
    expect(res.status).toBe(201);
    const session = (await res.json()) as { id: string; mode: string };

    expect(session.mode).toBe("correction");
    const [opening] = openingOf(session.id);
    expect(opening).toMatchObject({ role: "assistant", provider: "gemini" });
    expect(opening.content).toContain("I ___ (live) here since 2020.");
  });

  it("starts a topic chat from a custom topic", async () => {
    const res = await start({ kind: "topic", topic: "My last holiday" });
    expect(res.status).toBe(201);
    const session = (await res.json()) as { id: string };
    expect(openingOf(session.id)).toHaveLength(1);
  });

  it("answers 502 with a message when every provider fails", async () => {
    fakeAi.gemini.fail = "quota";
    fakeAi.groq.fail = "unavailable";
    const res = await start({ kind: "contrast", tense: "past_simple", contrastWith: "present_perfect" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
    expect(db.select().from(schema.sessions).all()).toHaveLength(0);
  });

  it("rejects invalid bodies", async () => {
    expect((await start({ kind: "nonsense" })).status).toBe(400);
    expect((await start({ kind: "form", tense: "not_a_tense" })).status).toBe(400);
    expect((await start({ kind: "topic" })).status).toBe(400);
  });
});
