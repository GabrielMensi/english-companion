// Database helpers for integration tests: the app's own `db` (real migrations, temp file from the
// setup) plus small seed functions. See docs/platform/TESTING.md.
import { eq, getTableName, is, sql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

import { db, schema } from "@/db";
import type { ErrorCategory, Severity } from "@/lib/taxonomy";

import { assertSafeDatabasePath } from "./temp-db";

export { db, schema };

/** The file the app's connection really has open (better-sqlite3's `name`, kept in globalThis by "@/db"), not just the env variable. */
function assertConnectionIsSafe() {
  const opened = (globalThis as { __sqlite?: { name: string } }).__sqlite;
  if (!opened) throw new Error("The app's database connection isn't open.");
  assertSafeDatabasePath(opened.name);
}
assertConnectionIsSafe();

/** Empties every app table (not the migrations table). Call it in `beforeEach` when tests share rows. */
export function resetDb(): void {
  assertConnectionIsSafe();
  for (const value of Object.values(schema)) {
    // The schema module also exports relations; only tables are emptied.
    if (is(value, SQLiteTable)) db.run(sql.raw(`DELETE FROM "${getTableName(value)}"`));
  }
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

/** The owner of a row (a chat or a message), so seeded children belong to the same user. */
function ownerOf(table: typeof schema.sessions | typeof schema.messages, id: string): string | null {
  return db.select({ userId: table.userId }).from(table).where(eq(table.id, id)).get()?.userId ?? null;
}

export function seedSession(values: Partial<typeof schema.sessions.$inferInsert> = {}) {
  return db
    .insert(schema.sessions)
    .values({ id: nextId("session"), title: "Test chat", mode: "correction", ...values })
    .returning()
    .get();
}

/** A user message with a finished analysis (`status: "done"`) unless `values` say otherwise. */
export function seedUserMessage(sessionId: string, values: Partial<typeof schema.messages.$inferInsert> = {}) {
  return db
    .insert(schema.messages)
    .values({
      id: nextId("message"),
      // Like the app: a message belongs to whoever owns its chat.
      userId: ownerOf(schema.sessions, sessionId),
      sessionId,
      role: "user",
      content: "I go to the park yesterday.",
      ...values,
    })
    .returning()
    .get();
}

export function seedCorrection(messageId: string, values: Partial<typeof schema.corrections.$inferInsert> = {}) {
  return db
    .insert(schema.corrections)
    .values({
      id: nextId("correction"),
      userId: ownerOf(schema.messages, messageId),
      messageId,
      original: "I go",
      correction: "I went",
      category: "verb_tense" as ErrorCategory,
      subcategory: "past_simple",
      severity: "moderate" as Severity,
      explanation: "Yesterday is past: use the past simple.",
      ...values,
    })
    .returning()
    .get();
}
