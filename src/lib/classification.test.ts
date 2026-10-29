// The deferred classifier works per user (docs/platform/AUTH_MULTIUSER.md, #125): each user's batch
// takes only their mistakes, with their settings, and a chat only holds back its own user's batch.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings-core";
import { saveSettings } from "@/lib/settings";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedCorrection, seedSession, seedUserMessage } from "@/test/db";
import { getClassificationStatus, startClassification, withChatPriority } from "./classification";

let a: TestUser;
let b: TestUser;

function mistake(user: TestUser, values: Parameters<typeof seedCorrection>[1] = {}) {
  return seedCorrection(seedUserMessage(seedSession({ userId: user.id }).id).id, values);
}

const classificationOf = (id: string) =>
  db.select().from(schema.corrections).where(eq(schema.corrections.id, id)).get()?.classification;

async function untilIdle(user: TestUser) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await waitFor(() => !getClassificationStatus(user.id).running);
}

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(condition()).toBe(true);
}

beforeEach(async () => {
  resetDb();
  a = await createTestUser("test@example.com");
  b = await createTestUser("other@example.com");
  resetFakeAi({ items: [{ index: 1, subtype: "tense_choice", tense: "past_simple", tenseUsed: "present_simple" }] });
});

describe("classification per user", () => {
  it("a user's batch takes only their mistakes", async () => {
    const mine = mistake(a, { severity: "typo", category: "spelling" });
    const theirs = mistake(b, { severity: "typo", category: "spelling" });

    startClassification(b.id);
    await untilIdle(b);

    expect(classificationOf(theirs.id)).toBe("done");
    expect(classificationOf(mine.id)).toBe("pending");
    expect(getClassificationStatus(a.id).pending).toBe(1);
    expect(getClassificationStatus(b.id).pending).toBe(0);
  });

  it("uses that user's settings (their provider), not another user's", async () => {
    saveSettings(a.id, { ...DEFAULT_SETTINGS, provider: "gemini", fallbacks: [] });
    saveSettings(b.id, { ...DEFAULT_SETTINGS, provider: "groq", fallbacks: [] });
    const theirs = mistake(b);

    startClassification(b.id);
    await untilIdle(b);

    expect(classificationOf(theirs.id)).toBe("done");
    expect(fakeAi.groq.calls).toBe(1);
    expect(fakeAi.gemini.calls).toBe(0);
  });

  it("a chat of one user holds back only that user's batch", async () => {
    const mine = mistake(a);
    const theirs = mistake(b);
    let release!: () => void;
    const chat = withChatPriority(a.id, () => new Promise<void>((resolve) => (release = resolve)));

    startClassification(a.id);
    startClassification(b.id);
    await untilIdle(b);
    expect(classificationOf(theirs.id)).toBe("done");
    expect(classificationOf(mine.id)).toBe("pending");

    release();
    await chat;
    await untilIdle(a);
    expect(classificationOf(mine.id)).toBe("done");
  });
});
