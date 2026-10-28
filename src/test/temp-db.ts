// Throwaway SQLite files for tests (no "@/db" import, so it also works for migration tests that open
// their own connections). See docs/platform/TESTING.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Resolves symlinks and `..` along the whole path so the check can't be sidestepped. Parts that don't exist
 * yet are kept as written, and a dangling symlink is followed to its target (it may point outside the temp
 * directory, to a folder that doesn't exist yet).
 */
function realLocation(file: string): string {
  const rest: string[] = [];
  let current = path.resolve(file);
  for (let hops = 0; hops < 40; hops++) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch {
      // Doesn't exist, or is a dangling link: look at it without following it.
    }
    let isLink = false;
    try {
      isLink = fs.lstatSync(current).isSymbolicLink();
    } catch {
      // Doesn't exist at all.
    }
    if (isLink) {
      current = path.resolve(path.dirname(current), fs.readlinkSync(current));
      continue;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  // A symlink loop: the filesystem root is never inside the temp directory, so the guard refuses it.
  return path.parse(path.resolve(file)).root;
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
