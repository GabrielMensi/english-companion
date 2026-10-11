import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { MIGRATIONS_TABLE, pendingMigrations } from "./migrations-core";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

function openSqlite(): Database.Database {
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "data/companion.db");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  // Wait for other processes' locks instead of failing with SQLITE_BUSY: the
  // build's parallel workers all open the database and migrate it at once.
  const sqlite = new Database(file, { timeout: 30_000 });
  // Owner-only: the database holds the API keys saved in Settings.
  restrictToOwner(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

function restrictToOwner(file: string) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      fs.chmodSync(f, 0o600);
    } catch {
      // Missing (WAL files appear later) or not ours to change, e.g. on a mounted volume.
    }
  }
}

// Reuse the SQLite connection across hot reloads in development. The Drizzle
// wrapper is recreated so it always uses the current schema.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

const sqlite = globalForDb.__sqlite ?? openSqlite();
if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db: DB = drizzle(sqlite, { schema });

/**
 * Applies the pending migrations, safely when several processes do it at once
 * (`next build` imports this module from parallel workers). Drizzle's own
 * `migrate()` reads the last applied migration before opening its transaction,
 * so two processes could both apply the same one ("duplicate column name").
 * Here `BEGIN IMMEDIATE` takes SQLite's write lock first (other processes wait,
 * see `timeout`), then reads Drizzle's `__drizzle_migrations` table with the
 * same rule, so whoever comes second finds nothing pending. All pending
 * migrations apply in one transaction: a failure rolls everything back.
 */
function migrate(sqlite: Database.Database, migrationsFolder: string) {
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

// Apply pending migrations on startup (and on hot reloads, so new migrations
// apply without restarting `pnpm dev`). Already-applied migrations are skipped.
migrate(sqlite, path.resolve(/*turbopackIgnore: true*/ "drizzle"));

export { schema };
