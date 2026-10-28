// Consistent backup of the database (SQLite's backup API, safe while the app runs), for cron.
//   node scripts/backup.mjs [--prefix=daily] [--keep=14]
// Writes <db folder>/backups/<prefix>-<timestamp>.db (mode 600) and keeps the newest `keep` with that prefix.
import fs from "node:fs";
import path from "node:path";
import { backupDatabase, backupsDir, pruneBackups, timestamp } from "@/db/backup";
import { openSqlite } from "@/db/connection";
import { parseEnv } from "@/lib/env";

async function main() {
  // Like the app: DATABASE_PATH may live only in .env.local (the container sets it for real).
  if (!process.env.DATABASE_PATH && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const args = process.argv.slice(2);
  const prefix = args.find((a) => a.startsWith("--prefix="))?.slice("--prefix=".length) || "daily";
  const keep = Number(args.find((a) => a.startsWith("--keep="))?.slice("--keep=".length) ?? 14);
  if (!/^[\w.-]+$/.test(prefix)) throw new Error(`Invalid --prefix "${prefix}"`);
  if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a whole number of at least 1");

  const file = path.resolve(parseEnv(process.env).DATABASE_PATH);
  // Never create an empty database by accident (a wrong DATABASE_PATH): a missing file is an error.
  if (!fs.existsSync(file)) throw new Error(`Database ${file} does not exist`);
  const sqlite = openSqlite(file);
  try {
    const destination = path.join(backupsDir(file), `${prefix}-${timestamp()}.db`);
    await backupDatabase(sqlite, destination);
    console.log(`Backup written to ${destination}`);
    const removed = pruneBackups(backupsDir(file), `${prefix}-`, keep);
    if (removed.length > 0) console.log(`Removed ${removed.length} old backup(s).`);
  } finally {
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
