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
        config.columns
          .map((c) => [c.name, c.notNull, c.primary || config.primaryKeys.some((pk) => pk.columns.includes(c))])
          .sort(),
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

describe("the multi-user migration (user_id on every data table)", () => {
  const BEFORE_TAG = "0014_auth_tables";
  /** Every table that gets a `user_id`, with the rows an app used for a while would have. */
  const DATA_TABLES = [
    "sessions",
    "messages",
    "corrections",
    "vocabulary",
    "reviews",
    "missed_exercises",
    "review_log",
    "read_aloud_attempts",
    "pronunciation_issues",
    "settings",
  ];

  function seedEveryTable(sqlite: Database.Database) {
    const at = 1_790_000_000_000;
    sqlite.exec(`
      INSERT INTO sessions (id, title, mode, created_at, updated_at) VALUES ('s1', 'Chat', 'correction', ${at}, ${at}), ('s2', 'Practice', 'correction', ${at}, ${at});
      INSERT INTO messages (id, session_id, role, content, status, word_count, created_at) VALUES ('m1', 's1', 'user', 'I go [mi amigo]', 'done', 3, ${at});
      INSERT INTO messages (id, session_id, role, reply_to_id, content, created_at) VALUES ('m2', 's1', 'assistant', 'm1', 'Nice!', ${at + 1});
      INSERT INTO corrections (id, message_id, original, correction, category, subcategory, severity, explanation, created_at)
        VALUES ('c1', 'm1', 'I go', 'I went', 'verb_tense', 'past_simple', 'moderate', 'Past.', ${at});
      INSERT INTO vocabulary (id, message_id, spanish, english, created_at) VALUES ('v1', 'm1', 'mi amigo', '["my friend"]', ${at});
      INSERT INTO reviews (id, kind, card_key, ease, interval_days, repetitions, lapses, due_at, review_count, created_at)
        VALUES ('r1', 'mistake', 'I go → I went', 2.5, 1, 1, 0, ${at}, 1, ${at}), ('r2', 'vocabulary', 'mi amigo', 2.5, 0, 0, 0, ${at}, 0, ${at});
      INSERT INTO missed_exercises (id, session_id, item_index, topic, sentence, answer, why, learner_answer, created_at)
        VALUES ('x1', 's2', 0, 'Past simple', 'I ___ (go)', 'went', 'Past.', 'go', ${at});
      INSERT INTO review_log (id, kind, card_key, grade, was_new, interval_days, reviewed_at) VALUES ('l1', 'mistake', 'I go → I went', 'good', 1, 1, ${at});
      INSERT INTO read_aloud_attempts (id, source, text, transcript, correct_words, total_words, created_at) VALUES ('a1', 'sounds', 'Read it', 'red it', 1, 2, ${at});
      INSERT INTO pronunciation_issues (id, attempt_id, expected, heard, category, created_at) VALUES ('p1', 'a1', 'read', 'red', 'vowel_length', ${at});
      INSERT INTO settings (key, value) VALUES ('app', '{"provider":"gemini"}'), ('api-keys', '{}'), ('practice:s2', '{"kind":"conversation","tense":"past_simple"}'), ('insights-plan', '{}');
    `);
  }

  const counts = (sqlite: Database.Database) =>
    Object.fromEntries(
      DATA_TABLES.map((t) => [t, sqlite.prepare(`SELECT count(*) FROM "${t}"`).pluck().get() as number]),
    );

  it("keeps the number of rows of every table and leaves them without an owner", () => {
    const { sqlite, dir } = tempDb();
    migrate(sqlite, migrationsUpTo(BEFORE_TAG, dir));
    seedEveryTable(sqlite);
    const before = counts(sqlite);
    expect(Object.values(before).every((n) => n > 0)).toBe(true);

    migrate(sqlite, MIGRATIONS);

    expect(counts(sqlite)).toEqual(before);
    for (const table of DATA_TABLES.filter((t) => t !== "settings")) {
      expect(sqlite.prepare(`SELECT count(*) FROM "${table}" WHERE user_id IS NOT NULL`).pluck().get(), table).toBe(0);
    }
    expect(sqlite.prepare("SELECT count(*) FROM user_settings").pluck().get()).toBe(0);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    // Cascades still work after the upgrade: deleting a chat takes its messages, corrections and words.
    sqlite.prepare("DELETE FROM sessions WHERE id = 's1'").run();
    expect(sqlite.prepare("SELECT count(*) FROM messages").pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT count(*) FROM corrections").pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT count(*) FROM vocabulary").pluck().get()).toBe(0);
  });

  it("makes the card state unique per user, not per card", () => {
    const { sqlite, dir } = tempDb();
    migrate(sqlite, migrationsUpTo(BEFORE_TAG, dir));
    seedEveryTable(sqlite);
    migrate(sqlite, MIGRATIONS);
    sqlite.exec(
      `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u1', 'A', 'a@x.com', 1, 1), ('u2', 'B', 'b@x.com', 1, 1)`,
    );
    const insert = sqlite.prepare(
      "INSERT INTO reviews (id, user_id, kind, card_key, ease, due_at, created_at) VALUES (?, ?, 'mistake', 'k', 2.5, 1, 1)",
    );
    insert.run("n1", "u1");
    insert.run("n2", "u2");
    expect(() => insert.run("n3", "u1")).toThrow(/UNIQUE/);
  });

  it("deleting a user deletes their data (and only theirs)", () => {
    const { sqlite } = tempDb();
    migrate(sqlite, MIGRATIONS);
    sqlite.exec(`
      INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u1', 'A', 'a@x.com', 1, 1), ('u2', 'B', 'b@x.com', 1, 1);
      INSERT INTO sessions (id, user_id, title, mode, created_at, updated_at) VALUES ('s1', 'u1', 'A chat', 'correction', 1, 1), ('s2', 'u2', 'B chat', 'correction', 1, 1);
      INSERT INTO user_settings (user_id, key, value) VALUES ('u1', 'app', '{}'), ('u2', 'app', '{}');
    `);
    sqlite.prepare("DELETE FROM user WHERE id = 'u1'").run();
    expect(sqlite.prepare("SELECT id FROM sessions").pluck().all()).toEqual(["s2"]);
    expect(sqlite.prepare("SELECT user_id FROM user_settings").pluck().all()).toEqual(["u2"]);
  });
});

/**
 * Why a statement isn't additive, or null. `-- allow-destructive: <reason>` in the statement's chunk
 * (the SQL between `--> statement-breakpoint` markers) opts that statement out.
 */
function statementReason(statement: string): string | null {
  if (/--\s*allow-destructive:\s*\S/i.test(statement)) return null;
  const code = statement.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // drizzle-kit's SQLite table rebuild: dangerous here, see docs/platform/TESTING.md.
  if (/__new_/i.test(code)) return "table rebuild (__new_*): DROP TABLE cascades to child rows";
  if (/\bDROP\s+TABLE\b/i.test(code)) return "DROP TABLE";
  if (/\bDROP\s+COLUMN\b/i.test(code)) return "DROP COLUMN";
  if (/\bRENAME\b/i.test(code)) return "RENAME";
  if (/\bDELETE\s+FROM\b/i.test(code)) return "DELETE FROM";
  if (/\bALTER\s+TABLE\b[\s\S]*\bADD\b/i.test(code) && /\bNOT\s+NULL\b/i.test(code) && !/\bDEFAULT\b/i.test(code)) {
    return "ADD COLUMN ... NOT NULL without DEFAULT";
  }
  return null;
}

function nonAdditiveReason(sql: string): string | null {
  for (const statement of sql.split("--> statement-breakpoint")) {
    const reason = statementReason(statement);
    if (reason) return reason;
  }
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
    // The marker covers its own statement only.
    expect(
      nonAdditiveReason("-- allow-destructive: ok\nDROP INDEX `i`;--> statement-breakpoint\nDROP TABLE `messages`;"),
    ).toBe("DROP TABLE");
    const rebuild =
      "PRAGMA foreign_keys=OFF;--> statement-breakpoint\nCREATE TABLE `__new_m` (`id` text);--> statement-breakpoint\nINSERT INTO `__new_m` SELECT `id` FROM `m`;--> statement-breakpoint\nDROP TABLE `m`;--> statement-breakpoint\nALTER TABLE `__new_m` RENAME TO `m`;";
    expect(nonAdditiveReason(rebuild)).toMatch(/table rebuild/);
  });

  it("the older migrations are not held to the rule (0002 deletes bad rows once, on purpose)", () => {
    const old = fs.readFileSync(path.join(MIGRATIONS, "0002_vocabulary_brackets_only.sql"), "utf8");
    expect(nonAdditiveReason(old)).toBe("DELETE FROM");
  });
});
