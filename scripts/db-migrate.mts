// Deploy step: backs up the database, then applies the pending migrations. Exits with a non-zero code if
// anything fails (a failed migration rolls back completely, see src/db/migrate.ts).
//   pnpm db:migrate [--label=v1.2.0] [--no-backup]            (local)
//   node scripts/db-migrate.mjs [--label=v1.2.0]              (in the container, compiled by the Dockerfile)
// The database is DATABASE_PATH; the backup goes to a "backups" folder next to it (mode 700, files 600).
import fs from "node:fs";
import path from "node:path";
import { backupDatabase, backupsDir, pruneBackups, timestamp } from "@/db/backup";
import { openSqlite, restrictToOwner } from "@/db/connection";
import { countPendingMigrations, migrate } from "@/db/migrate";
import { parseEnv } from "@/lib/env";

const KEEP_PRE_MIGRATION_BACKUPS = 14;

async function main() {
  const args = process.argv.slice(2);
  const label = args.find((a) => a.startsWith("--label="))?.slice("--label=".length) || "migrate";
  if (!/^[\w.-]+$/.test(label)) throw new Error(`Invalid --label "${label}": use letters, digits, ".", "_" or "-"`);
  const skipBackup = args.includes("--no-backup");

  const file = path.resolve(parseEnv(process.env).DATABASE_PATH);
  const existed = fs.existsSync(file);
  const migrationsFolder = path.resolve("drizzle");
  const sqlite = openSqlite(file);
  try {
    const pending = countPendingMigrations(sqlite, migrationsFolder);
    if (pending === 0) {
      console.log("Database is up to date: no pending migrations.");
      return;
    }
    if (existed && !skipBackup) {
      const dir = backupsDir(file);
      const backup = path.join(dir, `pre-${timestamp()}-${label}.db`);
      await backupDatabase(sqlite, backup);
      console.log(`Backup written to ${backup}`);
      pruneBackups(dir, "pre-", KEEP_PRE_MIGRATION_BACKUPS);
    } else {
      console.log(existed ? "Skipping the backup (--no-backup)." : "New database: nothing to back up.");
    }
    migrate(sqlite, migrationsFolder);
    console.log(`Applied ${pending} migration(s).`);
  } finally {
    sqlite.close();
    restrictToOwner(file);
  }
}

main().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
