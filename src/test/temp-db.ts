// Throwaway SQLite files for tests (no "@/db" import, so it also works for migration tests that open
// their own connections). See docs/platform/TESTING.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/** Resolves symlinks of the file's folder (the file may not exist yet) so the check can't be sidestepped. */
function realLocation(file: string): string {
  const absolute = path.resolve(file);
  try {
    return path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
  } catch {
    return absolute;
  }
}

/** Whether `file` really lives inside the OS temp directory (after resolving symlinks and `..`). */
export function isInTempDir(file: string): boolean {
  const relative = path.relative(fs.realpathSync(os.tmpdir()), realLocation(file));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Allowlist: tests only ever use databases inside the OS temp directory. Anything else (data/companion.db,
 * data/dev.db, the live app's folder reached by an absolute path or a symlink) throws.
 */
export function assertSafeDatabasePath(file: string): void {
  if (!isInTempDir(file)) {
    throw new Error(`Refusing to run tests against ${file}: test databases must live in the OS temp directory.`);
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
