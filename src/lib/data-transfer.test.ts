// Export / import of one account: only its data, never the API keys, and repeatable.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedSession, seedUserMessage } from "@/test/db";
import { setApiKey } from "@/lib/secrets";
import { exportUserData, importUserData } from "@/lib/data-transfer";
import { parseExportFile } from "@/lib/data-transfer-core";
import { setUserSetting } from "@/lib/user-settings";

const exportRoute = await import("@/app/api/data/export/route");
const importRoute = await import("@/app/api/data/import/route");

let a: TestUser;
let b: TestUser;

function seedAccount(user: TestUser, tag: string) {
  const session = seedSession({ userId: user.id, title: `Chat ${tag}` });
  const user1 = seedUserMessage(session.id, { content: `I go ${tag}`, status: "done" });
  const reply = seedUserMessage(session.id, { role: "assistant", content: `Nice ${tag}`, replyToId: user1.id });
  db.insert(schema.corrections)
    .values({
      id: `corr-${tag}`,
      userId: user.id,
      messageId: user1.id,
      original: "I go",
      correction: "I went",
      category: "verb_tense",
      subcategory: "past_simple",
      severity: "moderate",
      explanation: "Past.",
    })
    .run();
  db.insert(schema.vocabulary)
    .values({ id: `voc-${tag}`, userId: user.id, messageId: user1.id, spanish: "amigo", english: ["friend"] })
    .run();
  db.insert(schema.reviews)
    .values({
      id: `rev-${tag}`,
      userId: user.id,
      kind: "vocabulary",
      cardKey: `amigo-${tag}`,
      ease: 2.5,
      dueAt: new Date(),
    })
    .run();
  setUserSetting(user.id, "app", { explanationLanguage: "en" });
  setUserSetting(user.id, `practice:${session.id}`, { kind: "conversation", tense: "past_simple" });
  setApiKey(user.id, "gemini", `AIza-secret-${tag}`);
  return { session, user1, reply };
}

const count = (table: typeof schema.messages | typeof schema.sessions, userId: string) =>
  db.select().from(table).where(eq(table.userId, userId)).all().length;

beforeEach(async () => {
  resetDb();
  a = await createTestUser("test@example.com");
  b = await createTestUser("other@example.com");
});

function parse(file: unknown) {
  const parsed = parseExportFile(JSON.parse(JSON.stringify(file)));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.file;
}

describe("export", () => {
  it("has only the account's data and never keys, login data or ids of users", () => {
    seedAccount(a, "A");
    seedAccount(b, "B");
    const text = JSON.stringify(exportUserData(a.id));
    expect(text).toContain("Chat A");
    expect(text).not.toContain("Chat B");
    expect(text).not.toContain("AIza-secret");
    expect(text).not.toContain("api-keys");
    expect(text).not.toContain("v1.");
    expect(text).not.toContain(a.id);
    expect(text).not.toContain(b.id);
    expect(text).not.toContain(a.email);
    expect(text).not.toContain("user_id");
  });

  it("the route needs a session, and answers a download", async () => {
    seedAccount(a, "A");
    expect((await exportRoute.GET(new Request("http://test/api/data/export"))).status).toBe(401);
    const res = await exportRoute.GET(a.request("http://test/api/data/export"));
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="english-companion-/);
    expect(JSON.parse(await res.text()).data.sessions).toHaveLength(1);
  });
});

describe("import", () => {
  it("round trip into another account: everything arrives, linked, and the keys do not", () => {
    seedAccount(a, "A");
    const summary = importUserData(b.id, parse(exportUserData(a.id)));
    expect(summary.added).toMatchObject({ sessions: 1, messages: 2, corrections: 1, vocabulary: 1, reviews: 1 });
    expect(summary.dropped).toBe(0);

    // Ids of A are taken: B's rows have their own, and still point at each other.
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.userId, b.id)).get()!;
    expect(session.id).not.toBe(db.select().from(schema.sessions).where(eq(schema.sessions.userId, a.id)).get()!.id);
    const messages = db.select().from(schema.messages).where(eq(schema.messages.userId, b.id)).all();
    expect(messages.every((m) => m.sessionId === session.id)).toBe(true);
    const reply = messages.find((m) => m.role === "assistant")!;
    expect(messages.find((m) => m.id === reply.replyToId)?.role).toBe("user");
    const correction = db.select().from(schema.corrections).where(eq(schema.corrections.userId, b.id)).get()!;
    expect(messages.some((m) => m.id === correction.messageId)).toBe(true);

    const settings = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, b.id)).all();
    expect(settings.map((s) => s.key).sort()).toEqual(["app", `practice:${session.id}`].sort());
    expect(JSON.stringify(settings)).not.toContain("AIza");
    // A is untouched.
    expect(count(schema.messages, a.id)).toBe(2);
  });

  it("per-chat settings (practice:, feedback:) follow their chat to its new id", () => {
    const { session } = seedAccount(a, "A");
    setUserSetting(a.id, `feedback:${session.id}`, { note: 1 });
    setUserSetting(a.id, "feedback:no-such-chat", { note: 2 });
    importUserData(b.id, parse(exportUserData(a.id)));
    const mine = db.select().from(schema.sessions).where(eq(schema.sessions.userId, b.id)).get()!;
    const keys = db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, b.id))
      .all()
      .map((s) => s.key);
    expect(keys.sort()).toEqual(["app", `feedback:${mine.id}`, `practice:${mine.id}`].sort());
  });

  it("is repeatable: importing the same file again adds nothing", () => {
    seedAccount(a, "A");
    const file = parse(exportUserData(a.id));
    importUserData(b.id, file);
    const again = importUserData(b.id, file);
    expect(Object.values(again.added).every((n) => n === 0)).toBe(true);
    expect(again.settingsAdded).toBe(0);
    expect(count(schema.messages, b.id)).toBe(2);
  });

  it("into the same account (a copy of its own export) adds nothing and changes nothing", () => {
    seedAccount(a, "A");
    const before = JSON.stringify(exportUserData(a.id).data);
    const summary = importUserData(a.id, parse(exportUserData(a.id)));
    expect(Object.values(summary.added).every((n) => n === 0)).toBe(true);
    expect(JSON.stringify(exportUserData(a.id).data)).toBe(before);
  });

  it("is additive: existing data and settings of the account stay", () => {
    seedAccount(a, "A");
    seedAccount(b, "B");
    importUserData(b.id, parse(exportUserData(a.id)));
    expect(count(schema.sessions, b.id)).toBe(2);
    expect(
      db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, b.id))
        .all()
        .map((s) => s.title)
        .sort(),
    ).toEqual(["Chat A", "Chat B"]);
  });

  it("drops rows whose parent is missing instead of failing", () => {
    seedAccount(a, "A");
    const file = exportUserData(a.id);
    file.data.messages = [];
    const summary = importUserData(b.id, parse(file));
    expect(summary.added.corrections).toBe(0);
    expect(summary.dropped).toBe(2);
    expect(summary.added.sessions).toBe(1);
  });
});

describe("validation", () => {
  it("refuses other files, newer versions and bad shapes", () => {
    expect(parseExportFile({ nope: 1 }).ok).toBe(false);
    expect(parseExportFile(null).ok).toBe(false);
    expect(parseExportFile({ format: "english-companion-export", version: 2, data: {} }).ok).toBe(false);
    expect(parseExportFile({ format: "english-companion-export", version: 1, data: { sessions: "x" } }).ok).toBe(false);
  });

  it("drops invalid rows and unknown settings (the API keys above all), keeps the rest", () => {
    seedAccount(a, "A");
    const file = JSON.parse(JSON.stringify(exportUserData(a.id)));
    file.data.corrections.push({ id: "bad", messageId: "x", category: "made_up_category" });
    file.data.sessions.push({ id: "", title: "no id" });
    file.settings["api-keys"] = { gemini: "AIza-evil" };
    file.settings["whatever"] = { x: 1 };
    const parsed = parseExportFile(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.invalid).toEqual({ corrections: 1, sessions: 1 });
    expect(
      Object.keys(parsed.file.settings)
        .map((k) => k.split(":")[0])
        .sort(),
    ).toEqual(["app", "practice"]);
  });

  it("the route refuses garbage (400), a huge body (413) and no session (401); a good file imports", async () => {
    seedAccount(a, "A");
    const post = (user: TestUser | null, body: string, headers: Record<string, string> = {}) => {
      const init = { method: "POST", body, headers };
      return importRoute.POST(
        user ? user.request("http://test/api/data/import", init) : new Request("http://test/api/data/import", init),
      );
    };
    const good = JSON.stringify(exportUserData(a.id));
    expect((await post(null, good)).status).toBe(401);
    expect((await post(b, "not json")).status).toBe(400);
    expect((await post(b, "{}")).status).toBe(400);
    expect((await post(b, good, { "content-length": String(60 * 1024 * 1024) })).status).toBe(413);
    const ok = await post(b, good);
    expect(ok.status).toBe(200);
    expect((await ok.json()).added.sessions).toBe(1);
    expect(count(schema.messages, b.id)).toBe(2);
  });
});
