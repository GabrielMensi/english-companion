// Migration tests (docs/platform/TESTING.md): the migrations apply on the user's real database at
// startup, so they must work on an empty database, keep the data of an older one and only add things.
import fs from "node:fs";
import path from "node:path";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { is } from "drizzle-orm";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, openDatabase, removeTempDir } from "@/test/temp-db";
import { migrate } from "./migrate";
import { MIGRATIONS_TABLE } from "./migrations-core";
import * as schema from "./schema";

const MIGRATIONS = path.resolve("drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
}
const journal = (
  JSON.parse(fs.readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  }
).entries;

/** The old data fixture is built with the migrations up to this one (the schema before voice dictation). */
const FIXTURE_LAST_TAG = "0005_tense_counts";
const fixtureLast = journal.findIndex((e) => e.tag === FIXTURE_LAST_TAG);

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tempDb(): { sqlite: Database.Database; dir: string } {
  const dir = makeTempDir("companion-migrations-");
  const sqlite = openDatabase(path.join(dir, "test.db"));
  cleanups.push(() => {
    sqlite.close();
    removeTempDir(dir);
  });
  return { sqlite, dir };
}

/** A copy of drizzle/ with only the migrations up to `lastTag`: what an older version of the app shipped. */
function migrationsUpTo(lastTag: string, dir: string): string {
  const upTo = journal.findIndex((e) => e.tag === lastTag);
  const folder = path.join(dir, `drizzle-up-to-${lastTag}`);
  fs.mkdirSync(path.join(folder, "meta"), { recursive: true });
  const kept = journal.slice(0, upTo + 1);
  for (const entry of kept)
    fs.copyFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
  const full = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as {
    entries: unknown[];
  };
  fs.writeFileSync(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({ ...full, entries: full.entries.slice(0, upTo + 1) }),
  );
  return folder;
}

interface ColumnInfo {
  name: string;
  notnull: number;
  pk: number;
}

function columnsOf(sqlite: Database.Database, table: string): ColumnInfo[] {
  return sqlite.prepare(`PRAGMA table_info("${table}")`).all() as ColumnInfo[];
}

describe("migrations on an empty database", () => {
  it("applies every migration and records each one", () => {
    const { sqlite } = tempDb();
    migrate(sqlite, MIGRATIONS);
    const applied = sqlite.prepare(`SELECT count(*) FROM "${MIGRATIONS_TABLE}"`).pluck().get();
    expect(applied).toBe(journal.length);
  });

  it("produces the schema in src/db/schema.ts (tables, columns, NOT NULL, primary keys)", () => {
    const { sqlite } = tempDb();
    migrate(sqlite, MIGRATIONS);

    const tables = Object.values(schema).filter((v) => is(v, SQLiteTable)) as Parameters<typeof getTableConfig>[0][];
    expect(tables.length).toBeGreaterThan(5);
    for (const table of tables) {
      const config = getTableConfig(table);
      const actual = columnsOf(sqlite, config.name);
      expect(actual.map((c) => [c.name, c.notnull === 1, c.pk > 0]).sort(), `table ${config.name}`).toEqual(
        config.columns.map((c) => [c.name, c.notNull, c.primary]).sort(),
      );
    }
  });

  it("is a no-op the second time", () => {
    const { sqlite } = tempDb();
    migrate(sqlite, MIGRATIONS);
    migrate(sqlite, MIGRATIONS);
    expect(sqlite.prepare(`SELECT count(*) FROM "${MIGRATIONS_TABLE}"`).pluck().get()).toBe(journal.length);
  });
});

describe("migrations on a database with old data", () => {
  /** Rows as the app wrote them when `FIXTURE_LAST_TAG` was the latest migration. */
  function seedOldData(sqlite: Database.Database) {
    const at = 1_790_000_000_000;
    sqlite.exec(`
      INSERT INTO sessions (id, title, mode, created_at, updated_at) VALUES ('s1', 'I go to the park', 'conversation', ${at}, ${at});
      INSERT INTO messages (id, session_id, role, content, status, corrected_text, word_count, provider, model, duration_ms, tense_counts, created_at)
        VALUES ('m1', 's1', 'user', 'I go to the park yesterday and met [mi amigo].', 'done', 'I went to the park yesterday.', 9, 'gemini', 'gemini-x', 1200, '{"version":1,"counts":{}}', ${at});
      INSERT INTO messages (id, session_id, role, reply_to_id, content, created_at)
        VALUES ('m2', 's1', 'assistant', 'm1', 'Nice! What did you do there?', ${at + 1});
      INSERT INTO messages (id, session_id, role, content, status, error_message, created_at)
        VALUES ('m3', 's1', 'user', 'Hello', 'error', 'All models failed', ${at + 2});
      INSERT INTO corrections (id, message_id, original, correction, category, subcategory, severity, explanation, subtype, tense, classification, classified_by, created_at)
        VALUES ('c1', 'm1', 'I go', 'I went', 'verb_tense', 'past_simple', 'moderate', 'Yesterday is past.', 'wrong_tense', 'past_simple', 'done', 'rule', ${at});
      INSERT INTO corrections (id, message_id, original, correction, category, subcategory, severity, explanation, created_at)
        VALUES ('c2', 'm1', 'teh', 'the', 'spelling', 'typo', 'minor', 'Typo.', ${at});
      INSERT INTO vocabulary (id, message_id, spanish, english, note, created_at)
        VALUES ('v1', 'm1', 'mi amigo', '["my friend"]', NULL, ${at});
      INSERT INTO settings (key, value) VALUES ('app', '{"provider":"gemini"}');
    `);
  }

  it("keeps every row and fills the new columns with their defaults", () => {
    const { sqlite, dir } = tempDb();
    migrate(sqlite, migrationsUpTo(FIXTURE_LAST_TAG, dir));
    seedOldData(sqlite);
    const counts = (db: Database.Database) =>
      Object.fromEntries(
        ["sessions", "messages", "corrections", "vocabulary", "settings"].map((t) => [
          t,
          db.prepare(`SELECT count(*) FROM ${t}`).pluck().get(),
        ]),
      );
    const before = counts(sqlite);
    expect(before).toEqual({ sessions: 1, messages: 3, corrections: 2, vocabulary: 1, settings: 1 });

    // The upgrade: the app starts with the current migrations on the old database.
    migrate(sqlite, MIGRATIONS);

    expect(counts(sqlite)).toEqual(before);
    expect(sqlite.prepare(`SELECT count(*) FROM "${MIGRATIONS_TABLE}"`).pluck().get()).toBe(journal.length);
    // Old values are intact.
    expect(
      sqlite.prepare("SELECT corrected_text, tense_counts, duration_ms FROM messages WHERE id = 'm1'").get(),
    ).toEqual({
      corrected_text: "I went to the park yesterday.",
      tense_counts: '{"version":1,"counts":{}}',
      duration_ms: 1200,
    });
    expect(sqlite.prepare("SELECT english FROM vocabulary WHERE id = 'v1'").pluck().get()).toBe('["my friend"]');
    expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'app'").pluck().get()).toBe('{"provider":"gemini"}');
    expect(sqlite.prepare("SELECT classification, subtype FROM corrections WHERE id = 'c1'").get()).toEqual({
      classification: "done",
      subtype: "wrong_tense",
    });
    // New columns: NOT NULL ones get a default, the others stay empty.
    expect(sqlite.prepare("SELECT DISTINCT input_mode FROM messages").pluck().all()).toEqual(["typed"]);
    expect(
      sqlite
        .prepare("SELECT severity_before_typo, discarded_at, discard_reason FROM corrections WHERE id = 'c2'")
        .get(),
    ).toEqual({ severity_before_typo: null, discarded_at: null, discard_reason: null });
    // New tables exist and are empty.
    expect(sqlite.prepare("SELECT count(*) FROM reviews").pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT count(*) FROM missed_exercises").pluck().get()).toBe(0);
  });

  it("keeps foreign keys working (deleting a chat still cascades)", () => {
    const { sqlite, dir } = tempDb();
    migrate(sqlite, migrationsUpTo(FIXTURE_LAST_TAG, dir));
    seedOldData(sqlite);
    migrate(sqlite, MIGRATIONS);

    sqlite.prepare("DELETE FROM sessions WHERE id = 's1'").run();
    expect(sqlite.prepare("SELECT count(*) FROM messages").pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT count(*) FROM corrections").pluck().get()).toBe(0);
  });
});

/** Why a migration's SQL isn't additive, or null. `-- allow-destructive: <reason>` opts a statement out. */
function nonAdditiveReason(sql: string): string | null {
  if (/--\s*allow-destructive:\s*\S/i.test(sql)) return null;
  const code = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\bDROP\s+TABLE\b/i.test(code)) return "DROP TABLE";
  if (/\bDROP\s+COLUMN\b/i.test(code)) return "DROP COLUMN";
  if (/\bRENAME\b/i.test(code)) return "RENAME";
  if (/\bDELETE\s+FROM\b/i.test(code)) return "DELETE FROM";
  const addsRequiredColumn = code
    .split(";")
    .some(
      (statement) =>
        /\bALTER\s+TABLE\b[\s\S]*\bADD\b/i.test(statement) &&
        /\bNOT\s+NULL\b/i.test(statement) &&
        !/\bDEFAULT\b/i.test(statement),
    );
  if (addsRequiredColumn) return "ADD COLUMN ... NOT NULL without DEFAULT";
  return null;
}

describe("new migrations are additive", () => {
  it("every migration after the fixture only adds tables, columns and indexes", () => {
    expect(fixtureLast).toBeGreaterThanOrEqual(0);
    const problems = journal
      .slice(fixtureLast + 1)
      .map((e) => ({
        tag: e.tag,
        reason: nonAdditiveReason(fs.readFileSync(path.join(MIGRATIONS, `${e.tag}.sql`), "utf8")),
      }))
      .filter((m) => m.reason);
    expect(problems).toEqual([]);
  });

  it("the rule catches what it should", () => {
    expect(nonAdditiveReason("ALTER TABLE `messages` ADD `x` text;")).toBeNull();
    expect(nonAdditiveReason("ALTER TABLE `messages` ADD `x` integer DEFAULT 0 NOT NULL;")).toBeNull();
    expect(nonAdditiveReason("CREATE TABLE `t` (`id` text PRIMARY KEY NOT NULL);")).toBeNull();
    expect(nonAdditiveReason("DROP TABLE `messages`;")).toBe("DROP TABLE");
    expect(nonAdditiveReason("ALTER TABLE `messages` DROP COLUMN `x`;")).toBe("DROP COLUMN");
    expect(nonAdditiveReason("ALTER TABLE `a` RENAME TO `b`;")).toBe("RENAME");
    expect(nonAdditiveReason("DELETE FROM `vocabulary`;")).toBe("DELETE FROM");
    expect(nonAdditiveReason("ALTER TABLE `m` ADD `x` text NOT NULL;")).toBe("ADD COLUMN ... NOT NULL without DEFAULT");
    expect(nonAdditiveReason("-- allow-destructive: dead column\nALTER TABLE `m` DROP COLUMN `x`;")).toBeNull();
  });

  it("the older migrations are not held to the rule (0002 deletes bad rows once, on purpose)", () => {
    const old = fs.readFileSync(path.join(MIGRATIONS, "0002_vocabulary_brackets_only.sql"), "utf8");
    expect(nonAdditiveReason(old)).toBe("DELETE FROM");
  });
});
