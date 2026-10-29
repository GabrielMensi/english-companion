// `pnpm auth:claim-data`: the data from before accounts becomes one user's, once, without losing a row.
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, openDatabase, removeTempDir } from "@/test/temp-db";
import { claimData, hasUnclaimedData, OWNED_TABLES, unclaimedCounts } from "./claim";
import { migrate } from "./migrate";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A migrated database holding what a single-user app left behind (rows without owner), plus two accounts. */
function oldDatabase(): Database.Database {
  const dir = makeTempDir("companion-claim-");
  const sqlite = openDatabase(path.join(dir, "test.db"));
  cleanups.push(() => {
    sqlite.close();
    removeTempDir(dir);
  });
  migrate(sqlite, path.resolve("drizzle"));
  const at = 1_790_000_000_000;
  sqlite.exec(`
    INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('ana', 'Ana', 'ana@x.com', ${at}, ${at}), ('bruno', 'Bruno', 'bruno@x.com', ${at}, ${at});
    INSERT INTO sessions (id, title, mode, created_at, updated_at) VALUES ('s1', 'Chat', 'correction', ${at}, ${at}), ('s2', 'Practice', 'correction', ${at}, ${at});
    INSERT INTO messages (id, session_id, role, content, status, created_at) VALUES ('m1', 's1', 'user', 'I go', 'done', ${at});
    INSERT INTO corrections (id, message_id, original, correction, category, subcategory, severity, explanation, created_at)
      VALUES ('c1', 'm1', 'I go', 'I went', 'verb_tense', 'past_simple', 'moderate', 'Past.', ${at});
    INSERT INTO vocabulary (id, message_id, spanish, english, created_at) VALUES ('v1', 'm1', 'amigo', '["friend"]', ${at});
    INSERT INTO reviews (id, kind, card_key, ease, due_at, review_count, created_at) VALUES ('r1', 'mistake', 'I go → I went', 2.5, ${at}, 3, ${at});
    INSERT INTO missed_exercises (id, session_id, item_index, topic, sentence, answer, why, learner_answer, created_at)
      VALUES ('x1', 's2', 0, 'Past', 'I ___', 'went', 'Past.', 'go', ${at});
    INSERT INTO review_log (id, kind, card_key, grade, was_new, interval_days, reviewed_at) VALUES ('l1', 'mistake', 'k', 'good', 1, 1, ${at});
    INSERT INTO read_aloud_attempts (id, source, text, transcript, correct_words, total_words, created_at) VALUES ('a1', 'sounds', 'Read', 'red', 1, 1, ${at});
    INSERT INTO pronunciation_issues (id, attempt_id, expected, heard, category, created_at) VALUES ('p1', 'a1', 'read', 'red', 'vowel_length', ${at});
    INSERT INTO settings (key, value) VALUES ('app', '{"explanationLanguage":"es"}'), ('api-keys', '{"groq":"k"}'), ('practice:s2', '{"kind":"conversation","tense":"past_simple"}'), ('insights-plan', '{"plan":1}');
  `);
  return sqlite;
}

const total = (sqlite: Database.Database, table: string) =>
  sqlite.prepare(`SELECT count(*) FROM "${table}"`).pluck().get() as number;

describe("claimData", () => {
  it("gives every ownerless row and the settings to the user, losing nothing", () => {
    const sqlite = oldDatabase();
    const before = Object.fromEntries(OWNED_TABLES.map((t) => [t, total(sqlite, t)]));
    expect(hasUnclaimedData(sqlite)).toBe(true);

    const result = claimData(sqlite, "Ana@X.com");

    expect(result.userId).toBe("ana");
    for (const table of OWNED_TABLES) {
      expect(total(sqlite, table), table).toBe(before[table]);
      expect(sqlite.prepare(`SELECT count(*) FROM "${table}" WHERE user_id = 'ana'`).pluck().get(), table).toBe(
        before[table],
      );
      expect(result.claimed[table]).toBe(before[table]);
    }
    expect(hasUnclaimedData(sqlite)).toBe(false);
    // Settings, practice state and AI outputs now belong to the user; the keys stay global.
    expect(sqlite.prepare("SELECT key FROM user_settings WHERE user_id = 'ana' ORDER BY key").pluck().all()).toEqual([
      "app",
      "insights-plan",
      "practice:s2",
    ]);
    expect(sqlite.prepare("SELECT key FROM settings").pluck().all()).toEqual(["api-keys"]);
    expect(result.claimed.settings).toBe(3);
  });

  it("is idempotent: the second run finds nothing and changes nothing", () => {
    const sqlite = oldDatabase();
    claimData(sqlite, "ana@x.com");
    const settingsAfterFirst = sqlite.prepare("SELECT * FROM user_settings").all();
    // The user changes a setting in between; a second run must not bring the old value back.
    sqlite.prepare("UPDATE user_settings SET value = '{\"explanationLanguage\":\"en\"}' WHERE key = 'app'").run();

    const again = claimData(sqlite, "ana@x.com");

    expect(Object.values(again.claimed).every((n) => n === 0)).toBe(true);
    expect(sqlite.prepare("SELECT value FROM user_settings WHERE key = 'app'").pluck().get()).toBe(
      '{"explanationLanguage":"en"}',
    );
    expect(sqlite.prepare("SELECT count(*) FROM user_settings").pluck().get()).toBe(settingsAfterFirst.length);
  });

  it("refuses an email without an account, and changes nothing", () => {
    const sqlite = oldDatabase();
    expect(() => claimData(sqlite, "nobody@x.com")).toThrow(/No account/);
    expect(hasUnclaimedData(sqlite)).toBe(true);
    expect(total(sqlite, "settings")).toBe(4);
  });

  it("never touches rows that already belong to someone else", () => {
    const sqlite = oldDatabase();
    sqlite.exec(`
      INSERT INTO sessions (id, user_id, title, mode, created_at, updated_at) VALUES ('sb', 'bruno', 'Bruno chat', 'correction', 1, 1);
      INSERT INTO user_settings (user_id, key, value) VALUES ('bruno', 'app', '{"explanationLanguage":"en"}');
    `);
    claimData(sqlite, "ana@x.com");
    expect(sqlite.prepare("SELECT user_id FROM sessions WHERE id = 'sb'").pluck().get()).toBe("bruno");
    expect(sqlite.prepare("SELECT value FROM user_settings WHERE user_id = 'bruno'").pluck().get()).toBe(
      '{"explanationLanguage":"en"}',
    );
    expect(sqlite.prepare("SELECT count(*) FROM sessions WHERE user_id = 'ana'").pluck().get()).toBe(2);
  });

  it("keeps the account's own state of a card it already reviewed, dropping the old duplicate", () => {
    const sqlite = oldDatabase();
    sqlite.exec(`INSERT INTO reviews (id, user_id, kind, card_key, ease, due_at, review_count, created_at)
      VALUES ('mine', 'ana', 'mistake', 'I go → I went', 2.5, 1, 1, 1)`);
    const result = claimData(sqlite, "ana@x.com");
    expect(result.duplicateReviews).toBe(1);
    expect(sqlite.prepare("SELECT id FROM reviews").pluck().all()).toEqual(["mine"]);
  });

  it("rolls back completely when a count doesn't add up", () => {
    const sqlite = oldDatabase();
    // A trigger that eats a row mid-claim stands for any bug that would lose data.
    sqlite.exec(`CREATE TRIGGER lose_row AFTER UPDATE ON vocabulary BEGIN DELETE FROM vocabulary; END`);
    const before = unclaimedCounts(sqlite);
    expect(() => claimData(sqlite, "ana@x.com")).toThrow(/row count of vocabulary/);
    expect(unclaimedCounts(sqlite)).toEqual(before);
    expect(total(sqlite, "user_settings")).toBe(0);
    expect(total(sqlite, "settings")).toBe(4);
  });
});
