// Throwaway SQLite files for tests (no "@/db" import, so it also works for migration tests that open
// their own connections). See docs/platform/TESTING.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/** Whether `file` is inside the repo's `data/` folder, where the real databases live. */
export function isUnderDataDir(file: string): boolean {
  const relative = path.relative(path.resolve(process.cwd(), "data"), path.resolve(file));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Throws when a test is about to use a database under `data/` (companion.db, dev.db...). */
export function assertSafeDatabasePath(file: string): void {
  if (isUnderDataDir(file)) {
    throw new Error(`Refusing to run tests against ${file}: databases under data/ are never used in tests.`);
  }
}

/** A fresh temp directory for one test file; remove it with {@link removeTempDir}. */
export function makeTempDir(prefix = "companion-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** A path for a database file in a new temp directory (the file is created when something opens it). */
export function tempDatabasePath(name = "test.db"): { file: string; dir: string } {
  const dir = makeTempDir();
  const file = path.join(dir, name);
  assertSafeDatabasePath(file);
  return { file, dir };
}

/** Opens a raw better-sqlite3 connection with the same pragmas as the app. */
export function openDatabase(file: string, options: { timeout?: number } = {}): Database.Database {
  assertSafeDatabasePath(file);
  const sqlite = new Database(file, { timeout: options.timeout ?? 30_000 });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}
