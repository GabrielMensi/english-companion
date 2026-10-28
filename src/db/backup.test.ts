import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, openDatabase, removeTempDir } from "@/test/temp-db";
import { backupDatabase, backupsDir, pruneBackups, timestamp } from "./backup";
import { restrictToOwner } from "./connection";
import { countPendingMigrations, migrate } from "./migrate";
import { MIGRATIONS_TABLE } from "./migrations-core";

const MIGRATIONS = path.resolve("drizzle");
const mode = (file: string) => fs.statSync(file).mode & 0o777;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup(): { dir: string; file: string; sqlite: Database.Database } {
  const dir = makeTempDir("companion-backup-");
  cleanups.push(() => removeTempDir(dir));
  const file = path.join(dir, "test.db");
  const sqlite = openDatabase(file);
  cleanups.push(() => sqlite.close());
  return { dir, file, sqlite };
}

describe("countPendingMigrations", () => {
  it("counts every migration on a database that was never migrated, and none after migrating", () => {
    const { sqlite } = setup();
    const total = countPendingMigrations(sqlite, MIGRATIONS);
    expect(total).toBeGreaterThan(0);
    migrate(sqlite, MIGRATIONS);
    expect(countPendingMigrations(sqlite, MIGRATIONS)).toBe(0);
  });

  it("counts only the migrations newer than the last applied one (an old database)", () => {
    const { sqlite } = setup();
    migrate(sqlite, MIGRATIONS);
    const rows = sqlite.prepare(`SELECT created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC`).pluck().all();
    // Forget the two newest: a database one release behind.
    sqlite.prepare(`DELETE FROM "${MIGRATIONS_TABLE}" WHERE created_at >= ?`).run(rows[1]);
    expect(countPendingMigrations(sqlite, MIGRATIONS)).toBe(2);
  });
});

describe("backupDatabase", () => {
  it("writes a restorable copy with mode 600 in a folder with mode 700, including data still in the WAL", async () => {
    const { file, sqlite } = setup();
    migrate(sqlite, MIGRATIONS);
    sqlite.exec("CREATE TABLE note (text TEXT)");
    sqlite.prepare("INSERT INTO note VALUES (?)").run("hello");

    const backup = path.join(backupsDir(file), "pre-test.db");
    await backupDatabase(sqlite, backup);

    expect(mode(backup)).toBe(0o600);
    expect(mode(path.dirname(backup))).toBe(0o700);
    const restored = openDatabase(backup);
    cleanups.push(() => restored.close());
    expect(restored.prepare("SELECT text FROM note").pluck().all()).toEqual(["hello"]);
    expect(countPendingMigrations(restored, MIGRATIONS)).toBe(0);
  });

  it("refuses to overwrite an existing backup", async () => {
    const { file, sqlite } = setup();
    const backup = path.join(backupsDir(file), "pre-test.db");
    await backupDatabase(sqlite, backup);
    await expect(backupDatabase(sqlite, backup)).rejects.toThrow(/already exists/);
  });
});

describe("pruneBackups", () => {
  it("keeps the newest files with the prefix and leaves other files alone", () => {
    const dir = makeTempDir("companion-prune-");
    cleanups.push(() => removeTempDir(dir));
    const names = ["pre-2026-01-01T00-00-00Z-a.db", "pre-2026-02-01T00-00-00Z-a.db", "pre-2026-03-01T00-00-00Z-a.db"];
    for (const name of [...names, "daily-2026-01-01T00-00-00Z.db", "notes.txt"]) {
      fs.writeFileSync(path.join(dir, name), "x");
    }
    expect(pruneBackups(dir, "pre-", 2)).toEqual([names[0]]);
    expect(fs.readdirSync(dir).sort()).toEqual(
      [names[1], names[2], "daily-2026-01-01T00-00-00Z.db", "notes.txt"].sort(),
    );
    expect(pruneBackups(dir, "pre-", 5)).toEqual([]);
    expect(pruneBackups(path.join(dir, "missing"), "pre-", 2)).toEqual([]);
  });
});

describe("timestamp", () => {
  it("is sortable and has no characters that are awkward in file names", () => {
    expect(timestamp(new Date("2026-10-28T20:05:09.123Z"))).toBe("2026-10-28T20-05-09Z");
  });
});

describe("restrictToOwner", () => {
  it("sets mode 600 on the database and ignores missing WAL files", () => {
    const { file } = setup();
    fs.writeFileSync(file, "x", { mode: 0o644 });
    restrictToOwner(file);
    expect(mode(file)).toBe(0o600);
  });
});
