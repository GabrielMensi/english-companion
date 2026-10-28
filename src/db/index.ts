import "server-only";

import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { serverEnv } from "@/lib/env";
import { openSqlite } from "./connection";
import { BUSY_TIMEOUT_MS, countPendingMigrations, migrate } from "./migrate";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

// Reuse the SQLite connection across hot reloads in development. The Drizzle
// wrapper is recreated so it always uses the current schema.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

const sqlite = globalForDb.__sqlite ?? openSqlite(path.resolve(/*turbopackIgnore: true*/ serverEnv().DATABASE_PATH));
// A connection kept from before a hot reload may predate the timeout, so set it again every time.
sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db: DB = drizzle(sqlite, { schema });

const migrationsFolder = path.resolve(/*turbopackIgnore: true*/ "drizzle");
if (serverEnv().MIGRATE_ON_START) {
  // Apply pending migrations on startup (and on hot reloads, so new migrations
  // apply without restarting `pnpm dev`). Already-applied migrations are skipped.
  migrate(sqlite, migrationsFolder);
} else if (countPendingMigrations(sqlite, migrationsFolder) > 0) {
  // A deployed app doesn't migrate by itself: that step takes a backup first.
  throw new Error(
    "The database has pending migrations and MIGRATE_ON_START is off. Run the migrate step first (pnpm db:migrate, or node scripts/db-migrate.mjs in the container).",
  );
}

export { schema };
