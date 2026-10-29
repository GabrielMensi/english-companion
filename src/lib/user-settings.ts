import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * A user's key-value store (`user_settings`): `app` (their settings), `practice:<chat id>`, `feedback:<chat id>` (the review of a topic chat), and the
 * AI outputs of the insights page. Every read and write names the user.
 */
const where = (userId: string, key: string) =>
  and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.key, key));

export function getUserSetting(userId: string, key: string): unknown {
  return db.select().from(schema.userSettings).where(where(userId, key)).get()?.value;
}

export function setUserSetting(userId: string, key: string, value: unknown): void {
  db.insert(schema.userSettings)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [schema.userSettings.userId, schema.userSettings.key], set: { value } })
    .run();
}

export function deleteUserSetting(userId: string, key: string): void {
  db.delete(schema.userSettings).where(where(userId, key)).run();
}

/** The user's entries whose key starts with `prefix`. */
export function listUserSettings(userId: string, prefix: string): { key: string; value: unknown }[] {
  return db
    .select({ key: schema.userSettings.key, value: schema.userSettings.value })
    .from(schema.userSettings)
    .where(
      and(
        eq(schema.userSettings.userId, userId),
        sql`substr(${schema.userSettings.key}, 1, ${prefix.length}) = ${prefix}`,
      ),
    )
    .all();
}
