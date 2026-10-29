import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { isAdmin } from "@/lib/auth/admin";
import { KEY_ENV_VARS, KEY_PROVIDERS, type KeyProvider, pickApiKey } from "@/lib/credentials";
import { getEncryptionKeys } from "@/lib/encryption-key";
import { serverEnv, sharedKeys } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets-crypto";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

/**
 * Each user's API keys, in their own `user_settings` row (`api-keys`), apart from the regular settings so
 * they are never sent to the browser along with them. Every key is encrypted at rest (secrets-crypto.ts),
 * tied to its owner and provider. A key that can't be decrypted (the server key was lost or changed)
 * counts as "no key" with a one-line warning: never an error page, the user pastes it again.
 */
const KEY = "api-keys";
/** The row of the single-user app: one global `settings` row, moved to the first account on first use. */
const LEGACY_KEY = "api-keys";

/** What is stored: provider -> `v1.…` (or, from older versions, the plain key). */
type StoredKeys = Partial<Record<KeyProvider, string>>;

const aad = (userId: string, provider: KeyProvider) => `${userId}:${provider}`;

function readRaw(userId: string): StoredKeys {
  const value = getUserSetting(userId, KEY);
  if (!value || typeof value !== "object") return {};
  const raw: StoredKeys = {};
  for (const provider of KEY_PROVIDERS) {
    const stored = (value as Record<string, unknown>)[provider];
    if (typeof stored === "string" && stored) raw[provider] = stored;
  }
  return raw;
}

/**
 * The single-user app kept the keys in one global row. Once, the first account (the owner of that data)
 * gets them: encrypted into its own row, then the old row is deleted, in one transaction. Idempotent; if
 * the encryption key can't be read the old row stays, so a key is never lost.
 */
function adoptLegacyKeys(userId: string): void {
  const legacy = db.select().from(schema.settings).where(eq(schema.settings.key, LEGACY_KEY)).get();
  if (!legacy || !isAdmin(userId)) return;
  try {
    const old = (legacy.value ?? {}) as Record<string, unknown>;
    const mine = readRaw(userId);
    const all = getEncryptionKeys(serverEnv());
    for (const provider of KEY_PROVIDERS) {
      const plain = old[provider];
      // What the account already saved is newer: it wins, unless it can't be decrypted (then it is useless).
      const mineOk = mine[provider] && decryptSecret(mine[provider], all, aad(userId, provider)).ok;
      if (typeof plain === "string" && plain.trim() && !mineOk) {
        mine[provider] = encryptSecret(plain.trim(), all[0], aad(userId, provider));
      }
    }
    db.transaction((tx) => {
      tx.insert(schema.userSettings)
        .values({ userId, key: KEY, value: mine })
        .onConflictDoUpdate({ target: [schema.userSettings.userId, schema.userSettings.key], set: { value: mine } })
        .run();
      tx.delete(schema.settings).where(eq(schema.settings.key, LEGACY_KEY)).run();
    });
  } catch (error) {
    warnOnce("adopt", `Could not move the saved API keys to the first account: ${errorName(error)}`);
  }
}

/** Warns once per process for each distinct problem: these functions run several times per page. */
const warned = new Set<string>();
function warnOnce(id: string, message: string) {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

/** The user's keys in plain text, in memory only. Undecryptable ones are left out. */
function getStoredKeys(userId: string): StoredKeys {
  adoptLegacyKeys(userId);
  const raw = readRaw(userId);
  if (Object.keys(raw).length === 0) return {};

  let keys: Buffer[];
  try {
    keys = getEncryptionKeys(serverEnv());
  } catch (error) {
    warnOnce("keyfile", `The saved API keys can't be read: ${errorName(error)}`);
    return {};
  }
  const plain: StoredKeys = {};
  let upgrade = false;
  for (const provider of KEY_PROVIDERS) {
    const stored = raw[provider];
    if (!stored) continue;
    const result = decryptSecret(stored, keys, aad(userId, provider));
    if (!result.ok) {
      warnOnce(
        `${userId}:${provider}:${result.reason}`,
        `The saved ${provider} API key can't be decrypted (${result.reason}); paste it again in Settings.`,
      );
      continue;
    }
    plain[provider] = result.plain;
    if (result.stale) {
      raw[provider] = encryptSecret(result.plain, keys[0], aad(userId, provider));
      upgrade = true;
    }
  }
  // Keys saved in plain text by an older version (or with a rotated-out key) are re-encrypted on read.
  if (upgrade) setUserSetting(userId, KEY, raw);
  return plain;
}

/** Saves (or, with null, removes) the user's key for a provider, encrypted. */
export function setApiKey(userId: string, provider: KeyProvider, apiKey: string | null) {
  adoptLegacyKeys(userId);
  const raw = readRaw(userId);
  const trimmed = apiKey?.trim();
  if (trimmed) raw[provider] = encryptSecret(trimmed, getEncryptionKeys(serverEnv())[0], aad(userId, provider));
  else delete raw[provider];
  setUserSetting(userId, KEY, raw);
}

/**
 * The key to use for this user: their own, else the server's from the environment (unless
 * `SHARED_KEYS=false`: then everyone brings their own).
 */
export function resolveApiKey(userId: string, provider: KeyProvider) {
  const env = serverEnv();
  return pickApiKey(getStoredKeys(userId)[provider], sharedKeys(env) ? env[KEY_ENV_VARS[provider]] : undefined);
}
