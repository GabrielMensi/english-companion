import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { serverEnv } from "@/lib/env";
import { BUSY_TIMEOUT_MS, migrate } from "./migrate";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

function openSqlite(): Database.Database {
  const file = path.resolve(/*turbopackIgnore: true*/ serverEnv().DATABASE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  // Wait for other processes' locks instead of failing with SQLITE_BUSY: the
  // build's parallel workers all open the database and migrate it at once.
  const sqlite = new Database(file, { timeout: BUSY_TIMEOUT_MS });
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
// A connection kept from before a hot reload may predate the timeout, so set it again every time.
sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db: DB = drizzle(sqlite, { schema });

// Apply pending migrations on startup (and on hot reloads, so new migrations
// apply without restarting `pnpm dev`). Already-applied migrations are skipped.
migrate(sqlite, path.resolve(/*turbopackIgnore: true*/ "drizzle"));

export { schema };
