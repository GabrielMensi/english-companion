// Gives the data from before accounts existed to one user (`pnpm auth:claim-data <email>`). No server-only
// import and no "@/db": it works on any better-sqlite3 handle, so the script and the tests share it.
import type Database from "better-sqlite3";

/** Tables with a nullable `user_id`: the rows with NULL are the ones from before accounts. */
export const OWNED_TABLES = [
  "sessions",
  "messages",
  "corrections",
  "vocabulary",
  "reviews",
  "missed_exercises",
  "review_log",
  "read_aloud_attempts",
  "pronunciation_issues",
] as const;

/** Legacy `settings` rows that stay global: the API keys, until each user has their own (#126). */
export const GLOBAL_SETTINGS = ["api-keys"];

const placeholders = GLOBAL_SETTINGS.map(() => "?").join(", ");

export interface ClaimResult {
  userId: string;
  /** Rows given to the user, per table; `settings` counts the key-value rows moved to `user_settings`. */
  claimed: Record<string, number>;
  /** Review states dropped because the user already had one for the same card (theirs wins). */
  duplicateReviews: number;
  /** Old settings rows dropped because the account had saved the same key since signing up (theirs wins). */
  skippedSettings: string[];
}

/** Rows without an owner, per table, and the legacy settings rows that move to a user. */
export function unclaimedCounts(sqlite: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of OWNED_TABLES) {
    counts[table] = sqlite.prepare(`SELECT count(*) FROM "${table}" WHERE user_id IS NULL`).pluck().get() as number;
  }
  counts.settings = sqlite
    .prepare(`SELECT count(*) FROM settings WHERE key NOT IN (${placeholders})`)
    .pluck()
    .get(...GLOBAL_SETTINGS) as number;
  return counts;
}

/** Whether any row has no owner. Stops at the first one found, so it is cheap enough for every page load. */
export function hasUnclaimedData(sqlite: Database.Database): boolean {
  for (const table of OWNED_TABLES) {
    if (sqlite.prepare(`SELECT 1 FROM "${table}" WHERE user_id IS NULL LIMIT 1`).get()) return true;
  }
  return (
    sqlite.prepare(`SELECT 1 FROM settings WHERE key NOT IN (${placeholders}) LIMIT 1`).get(...GLOBAL_SETTINGS) !==
    undefined
  );
}

function totals(sqlite: Database.Database): Record<string, number> {
  return Object.fromEntries(
    OWNED_TABLES.map((table) => [table, sqlite.prepare(`SELECT count(*) FROM "${table}"`).pluck().get() as number]),
  );
}

/**
 * Moves every ownerless row (and the legacy settings rows) to the user with this email, in one
 * transaction that rolls back if a count doesn't add up. Safe to run again: it only touches rows
 * with no owner, and the settings rows it copies are removed from the old table.
 *
 * Throws when no account has that email.
 */
export function claimData(sqlite: Database.Database, email: string): ClaimResult {
  const user = sqlite.prepare("SELECT id FROM user WHERE email = ?").get(email.trim().toLowerCase()) as
    { id: string } | undefined;
  if (!user) throw new Error(`No account with the email ${email}. Create it at /signup first.`);

  const run = sqlite.transaction((): ClaimResult => {
    const before = totals(sqlite);
    const claimed: Record<string, number> = {};
    let duplicateReviews = 0;

    // A card the user already has a state for (they reviewed it since signing up) keeps their state.
    duplicateReviews = sqlite
      .prepare(
        `DELETE FROM reviews WHERE user_id IS NULL AND EXISTS (
           SELECT 1 FROM reviews mine
           WHERE mine.user_id = ? AND mine.kind = reviews.kind AND mine.card_key = reviews.card_key)`,
      )
      .run(user.id).changes;

    for (const table of OWNED_TABLES) {
      claimed[table] = sqlite.prepare(`UPDATE "${table}" SET user_id = ? WHERE user_id IS NULL`).run(user.id).changes;
    }

    const rows = sqlite
      .prepare(`SELECT key, value FROM settings WHERE key NOT IN (${placeholders})`)
      .all(...GLOBAL_SETTINGS) as { key: string; value: string }[];
    // What the account saved after signing up is newer than the old rows: it stays, the old row is dropped.
    const exists = sqlite.prepare("SELECT 1 FROM user_settings WHERE user_id = ? AND key = ?");
    const put = sqlite.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)");
    const skippedSettings: string[] = [];
    let moved = 0;
    for (const row of rows) {
      if (exists.get(user.id, row.key)) skippedSettings.push(row.key);
      else {
        put.run(user.id, row.key, row.value);
        moved++;
      }
    }
    sqlite.prepare(`DELETE FROM settings WHERE key NOT IN (${placeholders})`).run(...GLOBAL_SETTINGS);
    claimed.settings = moved;

    // Nothing may be left without an owner, and no row may have appeared or disappeared (except the duplicates).
    const after = totals(sqlite);
    for (const table of OWNED_TABLES) {
      const expected = before[table] - (table === "reviews" ? duplicateReviews : 0);
      if (after[table] !== expected)
        throw new Error(`The row count of ${table} changed (${before[table]} to ${after[table]})`);
    }
    const left = Object.entries(unclaimedCounts(sqlite)).filter(([, n]) => n > 0);
    if (left.length > 0)
      throw new Error(`Rows without an owner remain: ${left.map(([t, n]) => `${t} ${n}`).join(", ")}`);

    return { userId: user.id, claimed, duplicateReviews, skippedSettings };
  });
  // IMMEDIATE: take the write lock first (waiting for the running app, see BUSY_TIMEOUT_MS) so a commit from
  // the app between our first read and first write can't fail the claim with SQLITE_BUSY.
  return run.immediate();
}
