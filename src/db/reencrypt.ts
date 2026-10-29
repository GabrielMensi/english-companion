// Re-encrypts every saved API key with the current server key (`pnpm keys:reencrypt`). No server-only
// import and no "@/db": it works on any better-sqlite3 handle, so the script and the tests share it.
import type Database from "better-sqlite3";
import { KEY_PROVIDERS } from "@/lib/credentials";
import { decryptSecret, encryptSecret } from "@/lib/secrets-crypto";

export interface ReencryptResult {
  /** Keys now encrypted with `keys[0]`. */
  reencrypted: number;
  /** Keys that no key could decrypt; left as they were. */
  failed: { userId: string; provider: string }[];
}

/**
 * In one transaction: every `api-keys` row of `user_settings` is decrypted with any of `keys` (current first,
 * then the old ones) and encrypted with `keys[0]`. A key that does not decrypt is kept untouched and
 * reported, never dropped. Safe to run again.
 */
export function reencryptKeys(sqlite: Database.Database, keys: Buffer[]): ReencryptResult {
  const rows = sqlite.prepare("SELECT user_id, value FROM user_settings WHERE key = 'api-keys'").all() as {
    user_id: string;
    value: string;
  }[];
  const update = sqlite.prepare("UPDATE user_settings SET value = ? WHERE user_id = ? AND key = 'api-keys'");
  const result: ReencryptResult = { reencrypted: 0, failed: [] };
  sqlite
    .transaction(() => {
      for (const row of rows) {
        const stored = JSON.parse(row.value) as Record<string, unknown>;
        for (const provider of KEY_PROVIDERS) {
          const value = stored[provider];
          if (typeof value !== "string") continue;
          const aad = `${row.user_id}:${provider}`;
          const decrypted = decryptSecret(value, keys, aad);
          if (!decrypted.ok) {
            result.failed.push({ userId: row.user_id, provider });
            continue;
          }
          stored[provider] = encryptSecret(decrypted.plain, keys[0], aad);
          result.reencrypted++;
        }
        update.run(JSON.stringify(stored), row.user_id);
      }
    })
    .immediate();
  return result;
}
