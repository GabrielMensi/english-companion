// Integration test (docs/platform/TESTING.md): the flashcard routes (review, suspend, delete) on the real database.
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { mistakeKey } from "@/lib/flashcards-core";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedCorrection, seedSession, seedUserMessage } from "@/test/db";

const cards = await import("@/app/api/flashcards/cards/route");
const reviews = await import("@/app/api/flashcards/reviews/route");

const KEY = mistakeKey("I go", "I went");

function call(handler: (request: Request) => Promise<Response>, method: string, body: unknown) {
  return handler(user.request("http://test/api/flashcards", { method, body: JSON.stringify(body) }));
}

function reviewRows() {
  return db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.kind, "mistake"), eq(schema.reviews.cardKey, KEY)))
    .all();
}

let user: TestUser;

beforeEach(async () => {
  resetDb();
  user = await createTestUser();
  seedCorrection(seedUserMessage(seedSession({ userId: user.id }).id).id);
});

describe("POST /api/flashcards/reviews", () => {
  it("schedules the card and logs the answer", async () => {
    const res = await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "good" });
    expect(res.status).toBe(200);
    const state = (await res.json()) as { repetitions: number; dueAt: number };
    expect(state.repetitions).toBe(1);
    expect(state.dueAt).toBeGreaterThan(Date.now());

    expect(reviewRows()).toMatchObject([{ reviewCount: 1, lastGrade: "good" }]);
    expect(db.select().from(schema.reviewLog).all()).toMatchObject([{ grade: "good", wasNew: true }]);
  });

  it("counts a second answer on the same card as a repeat, not a new card", async () => {
    await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "good" });
    await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "again" });

    expect(reviewRows()).toMatchObject([{ reviewCount: 2, lastGrade: "again" }]);
    expect(
      db
        .select()
        .from(schema.reviewLog)
        .all()
        .map((r) => r.wasNew),
    ).toEqual([true, false]);
  });

  it("rejects an unknown grade or kind", async () => {
    expect((await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "perfect" })).status).toBe(400);
    expect((await call(reviews.POST, "POST", { kind: "other", key: KEY, grade: "good" })).status).toBe(400);
    expect(reviewRows()).toHaveLength(0);
  });
});

describe("/api/flashcards/cards", () => {
  it("suspends a card and brings it back", async () => {
    expect((await call(cards.PATCH, "PATCH", { kind: "mistake", key: KEY, suspended: true })).status).toBe(204);
    expect(reviewRows()[0].suspendedAt).toBeInstanceOf(Date);

    expect((await call(cards.PATCH, "PATCH", { kind: "mistake", key: KEY, suspended: false })).status).toBe(204);
    // Never reviewed: the placeholder row is gone, so the card is new again.
    expect(reviewRows()).toHaveLength(0);
  });

  it("keeps the progress of a reviewed card when it is suspended and restored", async () => {
    await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "good" });
    await call(cards.PATCH, "PATCH", { kind: "mistake", key: KEY, suspended: true });
    await call(cards.PATCH, "PATCH", { kind: "mistake", key: KEY, suspended: false });
    expect(reviewRows()).toMatchObject([{ reviewCount: 1, suspendedAt: null }]);
  });

  it("deletes a mistake card at its source, with its review state", async () => {
    await call(reviews.POST, "POST", { kind: "mistake", key: KEY, grade: "good" });
    expect((await call(cards.DELETE, "DELETE", { kind: "mistake", key: KEY })).status).toBe(204);

    expect(db.select().from(schema.corrections).all()).toHaveLength(0);
    expect(reviewRows()).toHaveLength(0);
  });

  it("rejects an invalid card", async () => {
    expect((await call(cards.PATCH, "PATCH", { kind: "mistake", key: "", suspended: true })).status).toBe(400);
    expect((await call(cards.DELETE, "DELETE", { kind: "nope", key: KEY })).status).toBe(400);
  });
});
