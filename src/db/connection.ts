// Opening the SQLite file (no server-only import, so the deploy scripts in scripts/ share it with the app).
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { BUSY_TIMEOUT_MS } from "./migrate";

/** Opens `file` (creating its folder with mode 700) with the app's pragmas, and keeps it owner-only. */
export function openSqlite(file: string): Database.Database {
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

/** The database file and its WAL side files get mode 600. */
export function restrictToOwner(file: string) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      fs.chmodSync(f, 0o600);
    } catch {
      // Missing (WAL files appear later) or not ours to change, e.g. on a mounted volume.
    }
  }
}
