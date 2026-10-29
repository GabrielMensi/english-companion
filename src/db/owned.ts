import { and, eq, type SQL } from "drizzle-orm";

import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * The filter every query of user data starts with: the rows of `userId`, plus any other conditions.
 * Rows without an owner (from before accounts, until `pnpm auth:claim-data`) never match.
 *
 *     db.select().from(schema.sessions).where(owned(schema.sessions, userId, eq(schema.sessions.id, id)))
 */
export function owned(table: { userId: SQLiteColumn }, userId: string, ...more: (SQL | undefined)[]): SQL {
  return and(eq(table.userId, userId), ...more) as SQL;
}
