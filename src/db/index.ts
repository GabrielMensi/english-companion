import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

function openSqlite(): Database.Database {
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "data/companion.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
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
