// Re-encrypts the saved API keys with the current APP_ENCRYPTION_KEY, after rotating it.
// Rotate: put the new key in APP_ENCRYPTION_KEY, move the previous one to APP_ENCRYPTION_KEYS_OLD, restart,
// run `pnpm keys:reencrypt`, and only then drop the old key. Backs up the database first. Safe to run again.
import fs from "node:fs";
import path from "node:path";

import { backupDatabase, backupsDir, timestamp } from "@/db/backup";
import { openSqlite, restrictToOwner } from "@/db/connection";
import { reencryptKeys } from "@/db/reencrypt";
import { getEncryptionKeys } from "@/lib/encryption-key";
import { parseEnv } from "@/lib/env";

async function main() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Not there.
    }
  }
  const env = parseEnv(process.env);
  const file = path.resolve(env.DATABASE_PATH);
  if (!fs.existsSync(file)) throw new Error(`Database ${file} does not exist`);
  const keys = getEncryptionKeys(env);
  const sqlite = openSqlite(file);
  try {
    const backup = path.join(backupsDir(file), `pre-reencrypt-${timestamp()}.db`);
    await backupDatabase(sqlite, backup);
    console.log(`Backup written to ${backup}`);
    const result = reencryptKeys(sqlite, keys);
    console.log(`Re-encrypted ${result.reencrypted} key(s) with the current key.`);
    for (const f of result.failed) {
      console.log(
        `  Could not decrypt the ${f.provider} key of user ${f.userId}: left as it was (paste it again in Settings).`,
      );
    }
    if (result.failed.length > 0) process.exitCode = 1;
  } finally {
    sqlite.close();
    restrictToOwner(file);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
