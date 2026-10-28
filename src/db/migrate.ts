import type Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { MIGRATIONS_TABLE, pendingMigrations } from "./migrations-core";

/** How long a connection waits for another process's lock before failing with SQLITE_BUSY. */
export const BUSY_TIMEOUT_MS = 30_000;

/**
 * Applies the pending migrations, safely when several processes do it at once
 * (`next build` imports this module from parallel workers). Drizzle's own
 * `migrate()` reads the last applied migration before opening its transaction,
 * so two processes could both apply the same one ("duplicate column name").
 * Here `BEGIN IMMEDIATE` takes SQLite's write lock first (other processes wait,
 * see `BUSY_TIMEOUT_MS`), then reads Drizzle's `__drizzle_migrations` table with the
 * same rule, so whoever comes second finds nothing pending. All pending
 * migrations apply in one transaction: a failure rolls everything back.
 */
export function migrate(sqlite: Database.Database, migrationsFolder: string) {
  const migrations = readMigrationFiles({ migrationsFolder });
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    // Same table definition as Drizzle's migrator, so both stay interchangeable.
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
    );
    const last = sqlite
      .prepare(`SELECT created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`)
      .pluck()
      .get() as number | string | null | undefined;
    const record = sqlite.prepare(`INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`);
    for (const migration of pendingMigrations(migrations, last)) {
      for (const statement of migration.sql) {
        if (statement.trim()) sqlite.exec(statement);
      }
      record.run(migration.hash, migration.folderMillis);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
    throw error;
  }
}
