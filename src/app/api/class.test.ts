// The class integration end to end (docs/class/CLASS_REPORT.md): routes, the "From class" source in the
// stats, the vocabulary and the flashcards, the report without class items, the teacher's level, and
// isolation between two accounts.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedCorrection, seedSession, seedUserMessage } from "@/test/db";

const classRoute = await import("@/app/api/class/route");
const classIdRoute = await import("@/app/api/class/[id]/route");
const parseRoute = await import("@/app/api/class/[id]/parse/route");
const itemsRoute = await import("@/app/api/class/[id]/items/route");
const reportRoute = await import("@/app/api/class/report/route");
const questionsRoute = await import("@/app/api/class/report/questions/route");

const { getDashboardData } = await import("@/lib/stats");
const { getVocabulary } = await import("@/lib/vocabulary");
const { getMistakeDeck } = await import("@/lib/flashcards");
const { listSessions, getSession } = await import("@/lib/chat");
const { getClassView, getTeacherLevel } = await import("@/lib/class");
const { getClassReport } = await import("@/lib/class-report");
const { getLevelData } = await import("@/lib/insights/insights");

const DAY = 86_400_000;
const IMPORT = {
  corrections: [
    {
      original: "I have went",
      correction: "I went",
      category: "verb_tense",
      subcategory: "Past simple",
      severity: "moderate",
      explanation: "Finished past: past simple.",
    },
    {
      original: "I'm agree",
      correction: "I agree",
      category: "verb_form",
      subcategory: "agree_no_be",
      severity: "moderate",
      explanation: "Agree is a verb, no need for be.",
    },
  ],
  words: [{ spanish: "lista de deseos", english: ["bucket list"], note: null }],
};

let a: TestUser;
let b: TestUser;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => JSON.stringify(body);

async function createClass(user: TestUser, body: object) {
  const res = await classRoute.POST(
    user.request("http://t/api/class", { method: "POST", body: json(body) }),
    undefined,
  );
  return { res, id: ((await res.json()) as { id: string }).id };
}

beforeEach(async () => {
  resetDb();
  resetFakeAi(IMPORT);
  a = await createTestUser("test@example.com");
  b = await createTestUser("other@example.com");
});

describe("classes and what the teacher corrected", () => {
  it("creates a class, structures the notes (saving nothing) and saves the reviewed items as From class", async () => {
    const heldAt = Date.now() - 2 * DAY;
    const { res, id } = await createClass(a, { heldAt, teacherLevel: "B1", notes: "Unit 4" });
    expect(res.status).toBe(201);

    const parsed = await parseRoute.POST(
      a.request(`http://t/api/class/${id}/parse`, { method: "POST", body: json({ text: "I have went → I went" }) }),
      ctx(id),
    );
    expect(parsed.status).toBe(200);
    const preview = (await parsed.json()) as typeof IMPORT;
    // Same fixed taxonomy, normalized label.
    expect(preview.corrections[0]).toMatchObject({ category: "verb_tense", subcategory: "past_simple" });
    expect(db.select().from(schema.corrections).all()).toHaveLength(0);

    const saved = await itemsRoute.POST(
      a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json({ ...preview, spokenWords: 200 }) }),
      ctx(id),
    );
    expect(saved.status).toBe(201);
    const rows = db.select().from(schema.corrections).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "class" && r.userId === a.id && r.classification === "pending")).toBe(true);
    expect(rows[0].createdAt.getTime()).toBe(heldAt);
    expect(db.select().from(schema.vocabulary).all()[0]).toMatchObject({ source: "class", spanish: "lista de deseos" });

    const view = getClassView(a.id);
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ teacherLevel: "B1", notes: "Unit 4" });
    expect(view[0].corrections).toHaveLength(2);
    expect(view[0].words).toHaveLength(1);
  });

  it("they count in the stats with the words spoken, and are not a chat", async () => {
    const { id } = await createClass(a, { heldAt: Date.now() - DAY });
    await itemsRoute.POST(
      a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json({ ...IMPORT, spokenWords: 100 }) }),
      ctx(id),
    );
    const { stats } = getDashboardData(a.id, "30");
    expect(stats.totals).toMatchObject({ errors: 2, words: 100, messages: 1 });
    expect(stats.categories.find((c) => c.category === "verb_tense")?.recent[0].source).toBe("class");

    // Without the number, a sentence per correction.
    const second = await createClass(a, { heldAt: Date.now() - DAY });
    await itemsRoute.POST(
      a.request(`http://t/api/class/${second.id}/items`, { method: "POST", body: json(IMPORT) }),
      ctx(second.id),
    );
    expect(getDashboardData(a.id, "30").stats.totals.words).toBe(100 + 2 * 12);

    // Hidden chat: not in the sidebar list, and can't be opened or written to.
    expect(listSessions(a.id)).toEqual([]);
    const chatId = db.select().from(schema.classSessions).where(eq(schema.classSessions.id, id)).get()!.chatSessionId!;
    expect(getSession(a.id, chatId)).toBeUndefined();
  });

  it("words only (no corrections) add no message to the stats", async () => {
    const { id } = await createClass(a, { heldAt: Date.now() - DAY });
    const res = await itemsRoute.POST(
      a.request(`http://t/api/class/${id}/items`, {
        method: "POST",
        body: json({ corrections: [], words: IMPORT.words }),
      }),
      ctx(id),
    );
    expect(res.status).toBe(201);
    expect(getDashboardData(a.id, "30").stats.totals.messages).toBe(0);
    expect(getVocabulary(a.id)[0]).toMatchObject({ source: "class", contexts: [] });
  });

  it("feed the flashcards and the vocabulary like the AI ones", async () => {
    const { id } = await createClass(a, { heldAt: Date.now() - DAY });
    await itemsRoute.POST(a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(IMPORT) }), ctx(id));
    const cards = getMistakeDeck(a.id).map((c) => c.card);
    expect(cards.map((c) => c.original).sort()).toEqual(["I have went", "I'm agree"]);
    expect(cards.every((c) => c.fromClass)).toBe(true);
    expect(getVocabulary(a.id)).toHaveLength(1);
  });

  it("rejects a future class, empty items and invalid data", async () => {
    const future = await createClass(a, { heldAt: Date.now() + 5 * DAY });
    const put = (id: string, body: unknown) =>
      itemsRoute.POST(a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(body) }), ctx(id));
    expect((await put(future.id, IMPORT)).status).toBe(400);
    const { id } = await createClass(a, { heldAt: Date.now() - DAY });
    expect((await put(id, { corrections: [], words: [] })).status).toBe(400);
    const invented = { ...IMPORT, corrections: [{ ...IMPORT.corrections[0], category: "made_up" }] };
    expect((await put(id, invented)).status).toBe(400);
    expect((await createClass(a, { heldAt: Date.now(), teacherLevel: "Z9" })).res.status).toBe(400);
  });

  it("changing the date moves what was loaded; deleting the class removes it all", async () => {
    const { id } = await createClass(a, { heldAt: Date.now() - DAY });
    await itemsRoute.POST(a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(IMPORT) }), ctx(id));
    const earlier = Date.now() - 10 * DAY;
    await classIdRoute.PATCH(
      a.request(`http://t/api/class/${id}`, { method: "PATCH", body: json({ heldAt: earlier, teacherLevel: "B2" }) }),
      ctx(id),
    );
    expect(
      db
        .select()
        .from(schema.corrections)
        .all()
        .every((c) => c.createdAt.getTime() === earlier),
    ).toBe(true);
    expect(getTeacherLevel(a.id)).toMatchObject({ level: "B2", heldAt: earlier });

    await classIdRoute.DELETE(a.request(`http://t/api/class/${id}`, { method: "DELETE" }), ctx(id));
    for (const table of [
      schema.corrections,
      schema.vocabulary,
      schema.messages,
      schema.sessions,
      schema.classSessions,
    ]) {
      expect(db.select().from(table).all()).toEqual([]);
    }
  });
});

describe("the report for class", () => {
  it("covers since the last class, leaves out what the teacher corrected and what came before", async () => {
    const lastClass = Date.now() - 3 * DAY;
    const { id } = await createClass(a, { heldAt: lastClass, teacherLevel: "B1" });
    await itemsRoute.POST(a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(IMPORT) }), ctx(id));

    const chat = seedSession({ userId: a.id });
    const recent = seedUserMessage(chat.id, { status: "done", wordCount: 50, createdAt: new Date(Date.now() - DAY) });
    seedCorrection(recent.id, { createdAt: new Date(Date.now() - DAY) });
    const old = seedUserMessage(chat.id, { status: "done", wordCount: 80, createdAt: new Date(lastClass - 5 * DAY) });
    seedCorrection(old.id, { createdAt: new Date(lastClass - 5 * DAY) });

    const report = getClassReport(a.id, {});
    expect(report.period.since?.id).toBe(id);
    expect(report.digest.totals).toMatchObject({ messages: 1, words: 50, errors: 1 });
    expect(report.digest.vocabulary).toEqual([]);
    expect(report.teacher?.level).toBe("B1");

    // The same period with the class items would have counted them (the dashboard includes them).
    expect(getDashboardData(a.id, "30").stats.totals.errors).toBe(4);

    const md = await reportRoute.GET(a.request(`http://t/api/class/report?since=${id}`), undefined);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(await md.text()).toContain("English report to take to class — since the class on");
  });

  it("writes and keeps the questions for the period; they go stale when the data changes", async () => {
    await createClass(a, { heldAt: Date.now() - 3 * DAY });
    const chat = seedSession({ userId: a.id });
    const message = seedUserMessage(chat.id, { status: "done", wordCount: 50, createdAt: new Date(Date.now() - DAY) });
    seedCorrection(message.id, { createdAt: new Date(Date.now() - DAY) });
    resetFakeAi({ questions: [{ ask: "Can we review the past simple?", why: "It was the top mistake." }] });

    const res = await questionsRoute.POST(
      a.request("http://t/api/class/report/questions", { method: "POST", body: json({}) }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(getClassReport(a.id, {}).questions?.questions[0].ask).toBe("Can we review the past simple?");
    seedCorrection(message.id, { original: "he go", correction: "he goes", createdAt: new Date(Date.now() - DAY) });
    expect(getClassReport(a.id, {}).questions).toBeNull();
  });
});

describe("the teacher's level next to the estimate", () => {
  it("shows the latest level given and compares it", async () => {
    expect(getLevelData(a.id).teacher).toBeNull();
    await createClass(a, { heldAt: Date.now() - 20 * DAY, teacherLevel: "A2" });
    await createClass(a, { heldAt: Date.now() - 5 * DAY, teacherLevel: "B1" });
    await createClass(a, { heldAt: Date.now() - DAY });
    expect(getLevelData(a.id).teacher).toMatchObject({ level: "B1", comparison: null });
  });
});

describe("isolation between accounts", () => {
  it("B never sees, changes or reports A's classes", async () => {
    const { id } = await createClass(a, { heldAt: Date.now() - 2 * DAY, teacherLevel: "C1" });
    await itemsRoute.POST(a.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(IMPORT) }), ctx(id));
    const before = JSON.stringify([
      db.select().from(schema.classSessions).all(),
      db.select().from(schema.corrections).all(),
      db.select().from(schema.vocabulary).all(),
    ]);

    expect(getClassView(b.id)).toEqual([]);
    expect(getTeacherLevel(b.id)).toBeNull();
    expect(getLevelData(b.id).teacher).toBeNull();
    expect(getClassReport(b.id, { sinceId: id }).period.since).toBeNull();
    expect(getClassReport(b.id, {}).digest.totals.errors).toBe(0);
    expect(
      ((await (await classRoute.GET(b.request("http://t/api/class"), undefined)).json()) as unknown[]).length,
    ).toBe(0);

    expect(
      (
        await classIdRoute.PATCH(
          b.request(`http://t/api/class/${id}`, { method: "PATCH", body: json({ notes: "x" }) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    await classIdRoute.DELETE(b.request(`http://t/api/class/${id}`, { method: "DELETE" }), ctx(id));
    expect(
      (
        await parseRoute.POST(
          b.request(`http://t/api/class/${id}/parse`, { method: "POST", body: json({ text: "x" }) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await itemsRoute.POST(
          b.request(`http://t/api/class/${id}/items`, { method: "POST", body: json(IMPORT) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
    expect(
      JSON.stringify([
        db.select().from(schema.classSessions).all(),
        db.select().from(schema.corrections).all(),
        db.select().from(schema.vocabulary).all(),
      ]),
    ).toBe(before);

    // Without a session: 401.
    expect((await classRoute.GET(new Request("http://t/api/class"), undefined)).status).toBe(401);
  });
});
