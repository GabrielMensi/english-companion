// Gives the data from before accounts existed (chats, mistakes, flashcards, settings...) to one account.
// Usage: pnpm auth:claim-data <email>
// Run it once, after creating that account at /signup. It backs up the database first and runs in one
// transaction; running it again does nothing. Uses DATABASE_PATH like the app (.env.local).
import fs from "node:fs";
import path from "node:path";
import { backupDatabase, backupsDir, timestamp } from "@/db/backup";
import { claimData, hasUnclaimedData, OWNED_TABLES, unclaimedCounts } from "@/db/claim";
import { openSqlite, restrictToOwner } from "@/db/connection";
import { countPendingMigrations } from "@/db/migrate";
import { parseEnv } from "@/lib/env";

async function main() {
  if (!process.env.DATABASE_PATH && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: pnpm auth:claim-data <email>");

  const file = path.resolve(parseEnv(process.env).DATABASE_PATH);
  if (!fs.existsSync(file)) throw new Error(`Database ${file} does not exist`);
  const sqlite = openSqlite(file);
  try {
    if (countPendingMigrations(sqlite, path.resolve("drizzle")) > 0) {
      throw new Error("The database has pending migrations. Start the app once (or run pnpm db:migrate) first.");
    }
    if (!sqlite.prepare("SELECT 1 FROM user WHERE email = ?").get(email)) {
      throw new Error(`No account with the email ${email}. Create it at /signup first.`);
    }
    if (!hasUnclaimedData(sqlite)) {
      console.log("Nothing to claim: every row already belongs to an account.");
      return;
    }
    console.log("Rows without an owner:", unclaimedCounts(sqlite));

    const backup = path.join(backupsDir(file), `pre-claim-${timestamp()}.db`);
    await backupDatabase(sqlite, backup);
    console.log(`Backup written to ${backup}`);

    const result = claimData(sqlite, email);
    console.log(`Done. Rows now owned by ${email}:`);
    for (const table of [...OWNED_TABLES, "settings"]) console.log(`  ${table}: ${result.claimed[table]}`);
    if (result.skippedSettings.length > 0) {
      console.log(
        `  (old settings not copied because the account already saved them: ${result.skippedSettings.join(", ")})`,
      );
    }
    if (result.duplicateReviews > 0) {
      console.log(
        `  (${result.duplicateReviews} old flashcard state(s) dropped: the account already had one for that card)`,
      );
    }
  } finally {
    sqlite.close();
    restrictToOwner(file);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
