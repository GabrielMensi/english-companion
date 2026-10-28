// The race-safe migrator (src/db/migrate.ts): `next build` imports the database module from parallel
// workers, and each one migrates it. Pure rules are tested in migrations-core.test.ts; this uses
// real connections on a temp file.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir, openDatabase, removeTempDir } from "@/test/temp-db";
import { BUSY_TIMEOUT_MS, migrate } from "./migrate";
import { MIGRATIONS_TABLE } from "./migrations-core";

const MIGRATIONS = path.resolve("drizzle");
const WORKER = path.resolve("src/test/migrate-worker.ts");
const run = promisify(execFile);

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tempFile(): string {
  const dir = makeTempDir("companion-migrate-");
  cleanups.push(() => removeTempDir(dir));
  return path.join(dir, "test.db");
}

function open(file: string, timeout?: number): Database.Database {
  const sqlite = openDatabase(file, { timeout });
  cleanups.push(() => sqlite.close());
  return sqlite;
}

const appliedCount = (sqlite: Database.Database) =>
  sqlite.prepare(`SELECT count(*) FROM "${MIGRATIONS_TABLE}"`).pluck().get();

describe("migrate with several connections", () => {
  it("waits for the write lock and applies nothing partially while another connection holds it", () => {
    const file = tempFile();
    const first = open(file);
    const second = open(file, 50);

    first.exec("BEGIN IMMEDIATE");
    expect(() => migrate(second, MIGRATIONS)).toThrow(/locked|busy/i);
    // The failed attempt left nothing behind.
    expect(second.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'sessions'").pluck().get()).toBe(0);

    first.exec("COMMIT");
    migrate(second, MIGRATIONS);
    expect(appliedCount(second)).toBeGreaterThan(0);
  });

  it("a second connection after the first finds nothing pending", () => {
    const file = tempFile();
    const first = open(file);
    const second = open(file);
    migrate(first, MIGRATIONS);
    const applied = appliedCount(first);
    // Would fail with "table already exists" if it tried to apply anything again.
    migrate(second, MIGRATIONS);
    expect(appliedCount(second)).toBe(applied);
  });

  it("applies every migration exactly once when several processes start at the same time", async () => {
    const file = tempFile();
    // Time for each process to load its code before the shared start.
    const startAt = Date.now() + 1500;
    const workers = Array.from({ length: 4 }, () =>
      run(process.execPath, ["--import", "tsx", WORKER, file, MIGRATIONS, String(startAt)], { timeout: 60_000 }),
    );
    // Every process finishes without "duplicate column name" or SQLITE_BUSY.
    await Promise.all(workers);

    const sqlite = open(file);
    const rows = sqlite.prepare(`SELECT hash FROM "${MIGRATIONS_TABLE}"`).pluck().all();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows).size).toBe(rows.length);
    expect(sqlite.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'sessions'").pluck().get()).toBe(1);
  }, 90_000);
});

describe("the app's connection", () => {
  it("sets the busy timeout again on a connection kept from before a hot reload", async () => {
    const stale = openDatabase(tempFile(), { timeout: 5000 });
    cleanups.push(() => stale.close());
    expect(stale.pragma("busy_timeout", { simple: true })).toBe(5000);

    const g = globalThis as { __sqlite?: Database.Database };
    const previous = g.__sqlite;
    g.__sqlite = stale;
    try {
      vi.resetModules();
      await import("@/db");
      expect(stale.pragma("busy_timeout", { simple: true })).toBe(BUSY_TIMEOUT_MS);
    } finally {
      g.__sqlite = previous;
    }
  });
});
