import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

function createDb(): DB {
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "data/companion.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  // Apply pending migrations on startup so a fresh clone works with `pnpm dev`.
  migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ "drizzle") });
  return db;
}

// Reuse the connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __db?: DB };

export const db: DB = globalForDb.__db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__db = db;

export { schema };
