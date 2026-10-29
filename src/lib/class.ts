import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import type { ClassSession } from "@/db/schema";
import { type ClassImport, classWordCount, isCefrLevel } from "@/lib/class-core";
import type { CefrLevel } from "@/lib/insights/level-core";

/** A class with the teacher and what was loaded from it, as the Class page shows it. */
export interface ClassSessionView {
  id: string;
  heldAt: number;
  teacherLevel: CefrLevel | null;
  notes: string | null;
  corrections: { id: string; original: string; correction: string; explanation: string; category: string }[];
  words: { id: string; spanish: string; english: string[] }[];
}

export function toMeeting(row: Pick<ClassSession, "id" | "heldAt" | "teacherLevel">) {
  return {
    id: row.id,
    heldAt: row.heldAt.getTime(),
    teacherLevel: isCefrLevel(row.teacherLevel) ? row.teacherLevel : null,
  };
}

export function listClassSessions(userId: string) {
  return db
    .select()
    .from(schema.classSessions)
    .where(owned(schema.classSessions, userId))
    .orderBy(desc(schema.classSessions.heldAt))
    .all();
}

export function getClassSession(userId: string, id: string) {
  return listClassSessions(userId).find((c) => c.id === id);
}

/** The classes with the corrections and words loaded from each, newest class first. */
export function getClassView(userId: string): ClassSessionView[] {
  const classes = listClassSessions(userId);
  const chats = new Map(classes.flatMap((c) => (c.chatSessionId ? [[c.chatSessionId, c.id] as const] : [])));
  const corrections = new Map<string, ClassSessionView["corrections"]>();
  const words = new Map<string, ClassSessionView["words"]>();
  if (chats.size > 0) {
    const chatIds = [...chats.keys()];
    const rows = db
      .select({
        id: schema.corrections.id,
        original: schema.corrections.original,
        correction: schema.corrections.correction,
        explanation: schema.corrections.explanation,
        category: schema.corrections.category,
        sessionId: schema.messages.sessionId,
      })
      .from(schema.corrections)
      .innerJoin(schema.messages, eq(schema.messages.id, schema.corrections.messageId))
      .where(owned(schema.corrections, userId, eq(schema.corrections.source, "class")))
      .all();
    for (const { sessionId, ...row } of rows) {
      const classId = chats.get(sessionId);
      if (classId) corrections.set(classId, [...(corrections.get(classId) ?? []), row]);
    }
    const wordRows = db
      .select({
        id: schema.vocabulary.id,
        spanish: schema.vocabulary.spanish,
        english: schema.vocabulary.english,
        sessionId: schema.messages.sessionId,
      })
      .from(schema.vocabulary)
      .innerJoin(schema.messages, eq(schema.messages.id, schema.vocabulary.messageId))
      .where(owned(schema.vocabulary, userId, inArray(schema.messages.sessionId, chatIds)))
      .all();
    for (const { sessionId, ...row } of wordRows) {
      const classId = chats.get(sessionId);
      if (classId) words.set(classId, [...(words.get(classId) ?? []), row]);
    }
  }
  return classes.map((c) => ({
    id: c.id,
    heldAt: c.heldAt.getTime(),
    teacherLevel: isCefrLevel(c.teacherLevel) ? c.teacherLevel : null,
    notes: c.notes,
    corrections: corrections.get(c.id) ?? [],
    words: words.get(c.id) ?? [],
  }));
}

export interface ClassInput {
  heldAt: number;
  teacherLevel: CefrLevel | null;
  notes: string | null;
}

export function createClassSession(userId: string, input: ClassInput) {
  return db
    .insert(schema.classSessions)
    .values({ id: crypto.randomUUID(), userId, ...input, heldAt: new Date(input.heldAt) })
    .returning()
    .get();
}

export function updateClassSession(userId: string, id: string, input: Partial<ClassInput>) {
  const { heldAt, ...rest } = input;
  const row = db
    .update(schema.classSessions)
    .set({ ...rest, ...(heldAt !== undefined && { heldAt: new Date(heldAt) }) })
    .where(owned(schema.classSessions, userId, eq(schema.classSessions.id, id)))
    .returning()
    .get();
  if (row && heldAt !== undefined && row.chatSessionId) moveLoadedItems(userId, row.chatSessionId, new Date(heldAt));
  return row;
}

/** What was loaded from a class keeps the date of the class, so the stats put it in the right period. */
function moveLoadedItems(userId: string, chatSessionId: string, date: Date) {
  const messages = db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(owned(schema.messages, userId, eq(schema.messages.sessionId, chatSessionId)))
    .all()
    .map((m) => m.id);
  if (messages.length === 0) return;
  db.update(schema.messages)
    .set({ createdAt: date })
    .where(owned(schema.messages, userId, inArray(schema.messages.id, messages)))
    .run();
  db.update(schema.corrections)
    .set({ createdAt: date })
    .where(owned(schema.corrections, userId, inArray(schema.corrections.messageId, messages)))
    .run();
  db.update(schema.vocabulary)
    .set({ createdAt: date })
    .where(owned(schema.vocabulary, userId, inArray(schema.vocabulary.messageId, messages)))
    .run();
}

/** Deletes the class and everything loaded from it (the corrections, words and the hidden chat). */
export function deleteClassSession(userId: string, id: string): boolean {
  const row = getClassSession(userId, id);
  if (!row) return false;
  db.transaction((tx) => {
    if (row.chatSessionId) {
      tx.delete(schema.sessions)
        .where(owned(schema.sessions, userId, eq(schema.sessions.id, row.chatSessionId)))
        .run();
    }
    tx.delete(schema.classSessions)
      .where(owned(schema.classSessions, userId, eq(schema.classSessions.id, id)))
      .run();
  });
  return true;
}

/**
 * Saves what the teacher corrected and taught as one message of the class's hidden chat, with the
 * corrections and words as ordinary rows of source "class". The message is "what the learner said"
 * (the corrected fragments), so tense counts and flashcard sentences work as for any message; its word
 * count is what the stats divide by (see `classWordCount`).
 */
export function saveClassItems(userId: string, classId: string, items: ClassImport & { spokenWords?: number | null }) {
  const row = getClassSession(userId, classId);
  if (!row) return undefined;
  const heldAt = row.heldAt;
  const originals = items.corrections.map((c) => c.original).join("\n");
  const corrected = items.corrections.map((c) => c.correction).join("\n");
  const content = originals || items.words.map((w) => w.spanish).join("\n");

  return db.transaction((tx) => {
    let chatId = row.chatSessionId;
    if (!chatId) {
      chatId = crypto.randomUUID();
      tx.insert(schema.sessions)
        .values({ id: chatId, userId, title: "Class", mode: "class", createdAt: heldAt, updatedAt: heldAt })
        .run();
      tx.update(schema.classSessions)
        .set({ chatSessionId: chatId })
        .where(owned(schema.classSessions, userId, eq(schema.classSessions.id, classId)))
        .run();
    }
    const messageId = crypto.randomUUID();
    tx.insert(schema.messages)
      .values({
        id: messageId,
        userId,
        sessionId: chatId,
        role: "user",
        status: "done",
        content,
        correctedText: corrected || null,
        inputMode: "spoken",
        wordCount: items.corrections.length > 0 ? classWordCount(items.spokenWords) : 0,
        createdAt: heldAt,
      })
      .run();
    if (items.corrections.length > 0) {
      tx.insert(schema.corrections)
        .values(
          items.corrections.map((c) => ({
            id: crypto.randomUUID(),
            userId,
            messageId,
            source: "class" as const,
            createdAt: heldAt,
            ...c,
          })),
        )
        .run();
    }
    if (items.words.length > 0) {
      tx.insert(schema.vocabulary)
        .values(
          items.words.map((w) => ({
            id: crypto.randomUUID(),
            userId,
            messageId,
            source: "class" as const,
            createdAt: heldAt,
            ...w,
          })),
        )
        .run();
    }
    return { corrections: items.corrections.length, words: items.words.length };
  });
}

/** The most recent teacher level, with the class it was given in. */
export function getTeacherLevel(userId: string): { level: CefrLevel; heldAt: number } | null {
  for (const c of listClassSessions(userId)) {
    if (isCefrLevel(c.teacherLevel)) return { level: c.teacherLevel, heldAt: c.heldAt.getTime() };
  }
  return null;
}

/** The hidden chats that hold what the teacher corrected in class. */
export function classChatIds(userId: string): string[] {
  return db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(owned(schema.sessions, userId, eq(schema.sessions.mode, "class")))
    .all()
    .map((s) => s.id);
}
