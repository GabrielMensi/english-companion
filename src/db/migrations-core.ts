// Which migrations still need to run, with the same rule as Drizzle's own
// migrator (drizzle-orm/sqlite-core `migrate`): a migration is pending when its
// journal timestamp (`folderMillis`, the "when" in drizzle/meta/_journal.json)
// is newer than the `created_at` of the most recent row in
// `__drizzle_migrations`. Keeping the rule identical means databases migrated
// by Drizzle's migrator are treated exactly as before.

export const MIGRATIONS_TABLE = "__drizzle_migrations";

export interface MigrationFile {
  folderMillis: number;
  hash: string;
  sql: string[];
}

/**
 * @param lastCreatedAt `created_at` of the newest applied migration (SQLite
 *   returns it as a number or a numeric string), or `undefined` when none has
 *   been applied yet.
 */
export function pendingMigrations<M extends MigrationFile>(
  migrations: readonly M[],
  lastCreatedAt: number | string | null | undefined,
): M[] {
  if (lastCreatedAt === undefined || lastCreatedAt === null) return [...migrations];
  const last = Number(lastCreatedAt);
  return migrations.filter((m) => last < m.folderMillis);
}
