// Isolation tests (docs/platform/AUTH_MULTIUSER.md, #125): two real accounts share one database, and
// what the second one asks for never touches or shows the first one's data, through every route and
// every statistic that loads data.
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { Analysis } from "@/lib/ai/analysis";
import { mistakeKey } from "@/lib/flashcards-core";
import { chatLabels, getPractice, savePractice } from "@/lib/practice";
import { getSettings, saveSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS } from "@/lib/settings-core";
import { fakeAi, resetFakeAi } from "@/test/ai";
import { createTestUser, type TestUser } from "@/test/auth";
import { db, resetDb, schema, seedCorrection, seedSession, seedUserMessage } from "@/test/db";

const sessionsRoute = await import("@/app/api/sessions/route");
const sessionRoute = await import("@/app/api/sessions/[id]/route");
const messagesRoute = await import("@/app/api/sessions/[id]/messages/route");
const feedbackRoute = await import("@/app/api/sessions/[id]/feedback/route");
const phrasesRoute = await import("@/app/api/sessions/[id]/phrases/route");
const retryRoute = await import("@/app/api/messages/[id]/retry/route");
const promptRoute = await import("@/app/api/messages/[id]/prompt/route");
const correctionRoute = await import("@/app/api/corrections/[id]/route");
const discardRoute = await import("@/app/api/corrections/[id]/discard/route");
const cardsRoute = await import("@/app/api/flashcards/cards/route");
const reviewsRoute = await import("@/app/api/flashcards/reviews/route");
const vocabularyRoute = await import("@/app/api/vocabulary/route");
const classificationRoute = await import("@/app/api/classification/route");
const settingsRoute = await import("@/app/api/settings/route");
const levelRoute = await import("@/app/api/insights/level/route");
const planRoute = await import("@/app/api/insights/plan/route");
const readAloudRoute = await import("@/app/api/read-aloud/route");
const practiceRoute = await import("@/app/api/practice/route");

const { getDashboardData } = await import("@/lib/stats");
const { getFlashcardsOverview, countCardsToStudy, getStudyQueue } = await import("@/lib/flashcards");
const { getSuspendedCards } = await import("@/lib/flashcards-upkeep");
const { getReviewDashboard } = await import("@/lib/review-stats");
const { getVocabulary } = await import("@/lib/vocabulary");
const { countDiscardedMistakes, getDiscardedMistakes } = await import("@/lib/corrections");
const { getReadAloudData, getPronunciationSummary, hasReadings, getAccuracyTimeline } =
  await import("@/lib/read-aloud");
const { getLevelData, getReportDigest, getStoredPlan } = await import("@/lib/insights/insights");
const { getClassificationStatus, retryFailedClassifications } = await import("@/lib/classification");
const { getPracticeSuggestions } = await import("@/lib/practice-start");
const { listSessions } = await import("@/lib/chat");

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
  reply: "Nice!",
};

let a: TestUser;
let b: TestUser;
/** Ids of everything user A owns. */
let ids: ReturnType<typeof seedFor>;

/** One of everything: a chat with a corrected message, a word, a flashcard, a reading, settings, practice... */
function seedFor(user: TestUser, suffix: string) {
  const session = seedSession({ userId: user.id, title: `Chat of ${suffix}` });
  const message = seedUserMessage(session.id, {
    status: "done",
    correctedText: `Corrected ${suffix}`,
    content: `Text of ${suffix} with [palabra${suffix}]`,
    tenseCounts: { version: 0, counts: {} },
  });
  const correction = seedCorrection(message.id, { original: `orig ${suffix}`, correction: `fixed ${suffix}` });
  const word = db
    .insert(schema.vocabulary)
    .values({
      id: `word-${suffix}`,
      userId: user.id,
      messageId: message.id,
      spanish: `palabra${suffix}`,
      english: ["word"],
    })
    .returning()
    .get();
  const review = db
    .insert(schema.reviews)
    .values({
      id: `review-${suffix}`,
      userId: user.id,
      kind: "mistake",
      cardKey: mistakeKey(correction.original, correction.correction),
      ease: 2.5,
      dueAt: new Date(),
      reviewCount: 1,
    })
    .returning()
    .get();
  db.insert(schema.reviewLog)
    .values({
      id: `log-${suffix}`,
      userId: user.id,
      kind: "mistake",
      cardKey: review.cardKey,
      grade: "good",
      wasNew: true,
      intervalDays: 1,
      reviewedAt: new Date(),
    })
    .run();
  const exercise = db
    .insert(schema.missedExercises)
    .values({
      id: `exercise-${suffix}`,
      userId: user.id,
      sessionId: session.id,
      itemIndex: 0,
      topic: "Past simple",
      sentence: `I ___ (go) ${suffix}`,
      answer: "went",
      why: "Past.",
      learnerAnswer: "go",
    })
    .returning()
    .get();
  const attempt = db
    .insert(schema.readAloudAttempts)
    .values({
      id: `attempt-${suffix}`,
      userId: user.id,
      source: "sounds",
      text: `Read this ${suffix}`,
      transcript: "red this",
      correctWords: 1,
      totalWords: 3,
    })
    .returning()
    .get();
  db.insert(schema.pronunciationIssues)
    .values({
      id: `issue-${suffix}`,
      userId: user.id,
      attemptId: attempt.id,
      expected: "read",
      heard: "red",
      category: "vowel_length",
    })
    .run();
  saveSettings(user.id, { ...DEFAULT_SETTINGS, explanationLanguage: suffix === "a" ? "es" : "en" });
  savePractice(user.id, session.id, { kind: "topic", preset: null, topic: `Topic ${suffix}` });
  return { session, message, correction, word, review, exercise, attempt };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => JSON.stringify(body);

beforeEach(async () => {
  resetDb();
  resetFakeAi(ANALYSIS);
  a = await createTestUser("test@example.com");
  b = await createTestUser("other@example.com");
  ids = seedFor(a, "a");
});

/** Row counts of everything A owns, to compare before and after B's attempts. */
function snapshotOfA() {
  return JSON.stringify({
    sessions: db.select().from(schema.sessions).where(eq(schema.sessions.userId, a.id)).all(),
    messages: db.select().from(schema.messages).where(eq(schema.messages.userId, a.id)).all(),
    corrections: db.select().from(schema.corrections).where(eq(schema.corrections.userId, a.id)).all(),
    vocabulary: db.select().from(schema.vocabulary).where(eq(schema.vocabulary.userId, a.id)).all(),
    reviews: db.select().from(schema.reviews).where(eq(schema.reviews.userId, a.id)).all(),
    reviewLog: db.select().from(schema.reviewLog).where(eq(schema.reviewLog.userId, a.id)).all(),
    exercises: db.select().from(schema.missedExercises).where(eq(schema.missedExercises.userId, a.id)).all(),
    attempts: db.select().from(schema.readAloudAttempts).where(eq(schema.readAloudAttempts.userId, a.id)).all(),
    issues: db.select().from(schema.pronunciationIssues).where(eq(schema.pronunciationIssues.userId, a.id)).all(),
    settings: db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, a.id)).all(),
  });
}

describe("routes with an id: another user's id is a 404 and changes nothing", () => {
  it("chats", async () => {
    const before = snapshotOfA();
    const id = ids.session.id;
    expect(
      (
        await sessionRoute.PATCH(
          b.request(`http://t/api/sessions/${id}`, { method: "PATCH", body: json({ title: "Mine now" }) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    // Deleting answers 204 whoever asks (nothing to reveal), but A's chat is still there.
    await sessionRoute.DELETE(b.request(`http://t/api/sessions/${id}`, { method: "DELETE" }), ctx(id));
    expect((await messagesRoute.GET(b.request(`http://t/api/sessions/${id}/messages`), ctx(id))).status).toBe(404);
    const post = await messagesRoute.POST(
      b.request(`http://t/api/sessions/${id}/messages`, { method: "POST", body: json({ text: "Hello" }) }),
      ctx(id),
    );
    expect(post.status).toBe(404);
    // Topic reviews, phrases and tense changes of A's chat are A's alone.
    expect(
      (await feedbackRoute.POST(b.request(`http://t/api/sessions/${id}/feedback`, { method: "POST" }), ctx(id))).status,
    ).toBe(404);
    expect(
      (await phrasesRoute.POST(b.request(`http://t/api/sessions/${id}/phrases`, { method: "POST" }), ctx(id))).status,
    ).toBe(404);
    expect(
      (
        await phrasesRoute.PUT(
          b.request(`http://t/api/sessions/${id}/phrases`, {
            method: "PUT",
            body: json({ phrases: [{ phrase: "walk me through", spanish: "x", messageId: ids.message.id }] }),
          }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await sessionRoute.PATCH(
          b.request(`http://t/api/sessions/${id}`, { method: "PATCH", body: json({ tense: "past_simple" }) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(snapshotOfA()).toBe(before);
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
  });

  it("messages: retry and improved prompt", async () => {
    const before = snapshotOfA();
    const id = ids.message.id;
    expect(
      (await retryRoute.POST(b.request(`http://t/api/messages/${id}/retry`, { method: "POST" }), ctx(id))).status,
    ).toBe(404);
    expect(
      (await promptRoute.POST(b.request(`http://t/api/messages/${id}/prompt`, { method: "POST" }), ctx(id))).status,
    ).toBe(404);
    expect(snapshotOfA()).toBe(before);
    expect(fakeAi.gemini.calls + fakeAi.groq.calls).toBe(0);
  });

  it("corrections: change the type, discard, restore", async () => {
    const before = snapshotOfA();
    const id = ids.correction.id;
    const retype = { category: "spelling", subtype: "keyboard_typo", tense: null, tenseUsed: null };
    expect(
      (
        await correctionRoute.PATCH(
          b.request(`http://t/api/corrections/${id}`, { method: "PATCH", body: json(retype) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await discardRoute.POST(
          b.request(`http://t/api/corrections/${id}/discard`, { method: "POST", body: json({ reason: "x" }) }),
          ctx(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (await discardRoute.DELETE(b.request(`http://t/api/corrections/${id}/discard`, { method: "DELETE" }), ctx(id)))
        .status,
    ).toBe(404);
    expect(snapshotOfA()).toBe(before);
  });

  it("flashcards: suspend, delete and review use B's own cards only", async () => {
    const before = snapshotOfA();
    const card = { kind: "mistake", key: ids.review.cardKey };
    await cardsRoute.PATCH(
      b.request("http://t/api/flashcards/cards", { method: "PATCH", body: json({ ...card, suspended: true }) }),
    );
    await cardsRoute.DELETE(b.request("http://t/api/flashcards/cards", { method: "DELETE", body: json(card) }));
    await cardsRoute.DELETE(
      b.request("http://t/api/flashcards/cards", {
        method: "DELETE",
        body: json({ kind: "exercise", key: ids.exercise.id }),
      }),
    );
    await cardsRoute.DELETE(
      b.request("http://t/api/flashcards/cards", {
        method: "DELETE",
        body: json({ kind: "pronunciation", key: ids.attempt.text }),
      }),
    );
    // B grades a card with the same key: it creates B's own state and leaves A's untouched.
    await reviewsRoute.POST(
      b.request("http://t/api/flashcards/reviews", { method: "POST", body: json({ ...card, grade: "again" }) }),
    );
    expect(snapshotOfA()).toBe(before);
    const mine = db
      .select()
      .from(schema.reviews)
      .where(and(eq(schema.reviews.userId, b.id), eq(schema.reviews.cardKey, card.key)))
      .all();
    expect(mine).toHaveLength(1);
    expect(db.select().from(schema.reviewLog).where(eq(schema.reviewLog.userId, a.id)).all()).toHaveLength(1);
  });

  it("vocabulary: deleting A's word ids", async () => {
    const before = snapshotOfA();
    const res = await vocabularyRoute.DELETE(
      b.request("http://t/api/vocabulary", { method: "DELETE", body: json({ ids: [ids.word.id] }) }),
    );
    expect(res.status).toBe(204);
    expect(snapshotOfA()).toBe(before);
  });

  it("the classifier retry only requeues the caller's mistakes", async () => {
    db.update(schema.corrections)
      .set({ classification: "failed" })
      .where(eq(schema.corrections.id, ids.correction.id))
      .run();
    retryFailedClassifications(b.id);
    expect(
      db.select().from(schema.corrections).where(eq(schema.corrections.id, ids.correction.id)).get()?.classification,
    ).toBe("failed");
  });
});

describe("listings and statistics: B sees nothing of A", () => {
  it("sessions and chat labels", async () => {
    const res = await sessionsRoute.GET(b.request("http://t/api/sessions"), undefined);
    expect(await res.json()).toEqual([]);
    expect(listSessions(b.id)).toEqual([]);
    expect(chatLabels(b.id).size).toBe(0);
    expect(chatLabels(a.id).get(ids.session.id)).toEqual({ practice: false, topic: "Topic a" });
    // A new chat of B shows up for B only.
    const created = (await (
      await sessionsRoute.POST(b.request("http://t/api/sessions", { method: "POST", body: json({}) }), undefined)
    ).json()) as { id: string };
    expect(listSessions(b.id).map((s) => s.id)).toEqual([created.id]);
    expect(listSessions(a.id).map((s) => s.id)).toEqual([ids.session.id]);
  });

  it("dashboard, tenses, vocabulary, fluency", () => {
    const mine = getDashboardData(a.id, "all");
    expect(mine.stats.totals.messages).toBe(1);
    const theirs = getDashboardData(b.id, "all");
    expect(theirs.stats.totals.messages).toBe(0);
    expect(theirs.stats.totals.words).toBe(0);
    expect(theirs.vocabulary).toEqual([]);
    expect(theirs.hasSpoken).toBe(false);
    expect(getVocabulary(b.id)).toEqual([]);
    expect(getVocabulary(a.id)).toHaveLength(1);
  });

  it("discarded mistakes: listed per owner, gone after undo", async () => {
    const id = ids.correction.id;
    const url = `http://t/api/corrections/${id}/discard`;
    expect(
      (await discardRoute.POST(a.request(url, { method: "POST", body: json({ reason: "fine" }) }), ctx(id))).status,
    ).toBe(200);
    expect(getDiscardedMistakes(b.id)).toEqual({ items: [], total: 0 });
    const mine = getDiscardedMistakes(a.id);
    expect(mine.total).toBe(1);
    expect(mine.items[0]).toMatchObject({ id, reason: "fine", sessionId: ids.session.id });
    expect(getDiscardedMistakes(a.id, 0)).toMatchObject({ items: [], total: 1 });
    expect(countDiscardedMistakes(a.id)).toBe(1);
    expect(countDiscardedMistakes(b.id)).toBe(0);
    await discardRoute.DELETE(a.request(url, { method: "DELETE" }), ctx(id));
    expect(getDiscardedMistakes(a.id)).toEqual({ items: [], total: 0 });
  });

  it("flashcards: decks, queue, counts, suspended cards, review stats", () => {
    const overview = getFlashcardsOverview(b.id);
    expect(
      overview.vocabulary.total + overview.mistakes.total + overview.exercises.total + overview.pronunciation.total,
    ).toBe(0);
    expect(getFlashcardsOverview(a.id).mistakes.total).toBe(1);
    for (const kind of ["vocabulary", "mistake", "exercise", "pronunciation"] as const) {
      expect(getStudyQueue(b.id, kind)).toEqual([]);
    }
    expect(countCardsToStudy(b.id)).toBe(0);
    expect(getSuspendedCards(b.id)).toEqual([]);
    const reviews = getReviewDashboard(b.id, "all");
    expect(reviews.totalCards).toBe(0);
    expect(reviews.stats.total).toBe(0);
    expect(getReviewDashboard(a.id, "all").stats.total).toBe(1);
  });

  it("read aloud: sentences, summary, readings, timeline", async () => {
    const data = getReadAloudData(b.id);
    expect(data.corrections).toEqual([]);
    expect(data.vocabulary).toEqual([]);
    expect(hasReadings(b.id)).toBe(false);
    expect(hasReadings(a.id)).toBe(true);
    expect(getPronunciationSummary(b.id).attempts).toBe(0);
    expect(getAccuracyTimeline(b.id, null)).toEqual([]);
    // A reading saved by B counts for B only.
    const body = {
      text: "Read this",
      source: "sounds",
      sourceId: null,
      focus: null,
      transcript: "red this",
      transcriptionProvider: null,
      transcriptionModel: null,
      audioDurationMs: null,
    };
    const res = await readAloudRoute.POST(
      b.request("http://t/api/read-aloud", { method: "POST", body: json(body) }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(getPronunciationSummary(b.id).attempts).toBe(1);
    expect(getPronunciationSummary(a.id).attempts).toBe(1);
  });

  it("insights: level, digest, stored plan and explanation", async () => {
    expect(getLevelData(b.id).estimate.words).toBe(0);
    expect(getReportDigest(b.id, "30").totals.messages).toBe(0);
    db.insert(schema.userSettings)
      .values({ userId: a.id, key: "insights-plan", value: { plan: "secret" } })
      .run();
    expect(getStoredPlan(a.id)).toEqual({ plan: "secret" });
    expect(getStoredPlan(b.id)).toBeNull();
    const level = await levelRoute.GET(b.request("http://t/api/insights/level"), undefined);
    expect(((await level.json()) as { explanation: unknown }).explanation).toBeNull();
    // B can't build a plan out of A's messages: B has none.
    const plan = await planRoute.POST(
      b.request("http://t/api/insights/plan", { method: "POST", body: json({ range: "7" }) }),
      undefined,
    );
    expect(plan.status).toBe(502);
  });

  it("practice suggestions, practice state and the classifier status", async () => {
    expect(getPracticeSuggestions(b.id).tenses.every((t) => t.status !== "weak")).toBe(true);
    expect(getPractice(b.id, ids.session.id)).toBeNull();
    expect(getPractice(a.id, ids.session.id)).toMatchObject({ kind: "topic" });
    expect(getClassificationStatus(a.id).pending).toBe(1);
    expect(getClassificationStatus(b.id)).toMatchObject({ pending: 0, failed: 0 });
    const res = await classificationRoute.GET(b.request("http://t/api/classification"), undefined);
    expect(await res.json()).toMatchObject({ pending: 0 });
    // Starting a topic chat writes B's practice entry, not A's.
    const started = await practiceRoute.POST(
      b.request("http://t/api/practice", {
        method: "POST",
        body: json({ kind: "topic", preset: null, topic: "Cooking" }),
      }),
      undefined,
    );
    expect(started.status).toBe(201);
    expect(chatLabels(a.id).size).toBe(1);
    expect(chatLabels(b.id).size).toBe(1);
  });
});

describe("settings", () => {
  it("are per user: each reads and saves its own", async () => {
    expect(getSettings(a.id).explanationLanguage).toBe("es");
    expect(getSettings(b.id).explanationLanguage).toBe(DEFAULT_SETTINGS.explanationLanguage);
    const patch = await settingsRoute.PATCH(
      b.request("http://t/api/settings", {
        method: "PATCH",
        body: json({ explanationLanguage: "en", newCardsPerSession: 3 }),
      }),
      undefined,
    );
    expect(patch.status).toBe(200);
    expect(getSettings(b.id).newCardsPerSession).toBe(3);
    expect(getSettings(a.id).newCardsPerSession).toBe(DEFAULT_SETTINGS.newCardsPerSession);
    expect(getSettings(a.id).explanationLanguage).toBe("es");
    const read = await settingsRoute.GET(a.request("http://t/api/settings"), undefined);
    expect(((await read.json()) as { settings: { explanationLanguage: string } }).settings.explanationLanguage).toBe(
      "es",
    );
  });

  it("the classifier works with its own user's settings", () => {
    // `getSettings` is the only way jobs read them, and it names the user: B's save didn't reach A (above).
    expect(getSettings("nobody")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("a message sent by B is B's alone", () => {
  it("is stored, analyzed and listed under B", async () => {
    const chat = (await (
      await sessionsRoute.POST(b.request("http://t/api/sessions", { method: "POST", body: json({}) }), undefined)
    ).json()) as { id: string };
    const sent = await messagesRoute.POST(
      b.request(`http://t/api/sessions/${chat.id}/messages`, {
        method: "POST",
        body: json({ text: "I go to the park yesterday." }),
      }),
      ctx(chat.id),
    );
    expect(sent.status).toBe(200);
    expect(db.select().from(schema.messages).where(eq(schema.messages.userId, b.id)).all()).toHaveLength(1);
    expect(db.select().from(schema.corrections).where(eq(schema.corrections.userId, b.id)).all()).toHaveLength(1);
    // Nothing without an owner, nothing of A's changed.
    for (const table of [schema.messages, schema.corrections, schema.vocabulary, schema.sessions]) {
      expect(
        db
          .select()
          .from(table)
          .all()
          .filter((row) => row.userId === null),
      ).toEqual([]);
    }
    expect(db.select().from(schema.messages).where(eq(schema.messages.userId, a.id)).all()).toHaveLength(1);
    expect(getDashboardData(a.id, "all").stats.totals.messages).toBe(1);
    expect(getDashboardData(b.id, "all").stats.totals.messages).toBe(1);
  });
});
