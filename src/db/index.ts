import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

function openSqlite(): Database.Database {
  const file = path.resolve(/*turbopackIgnore: true*/ serverEnv().DATABASE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  const sqlite = new Database(file);
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

// Apply pending migrations on startup (and on hot reloads, so new migrations
// apply without restarting `pnpm dev`). Already-applied migrations are skipped.
migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ "drizzle") });

export { schema };
