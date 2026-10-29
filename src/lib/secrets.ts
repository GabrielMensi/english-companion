import "server-only";

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { serverEnv } from "@/lib/env";
import { KEY_ENV_VARS, type KeyProvider, pickApiKey } from "@/lib/credentials";

/**
 * API keys live in their own settings row, apart from the regular settings, so
 * they are never sent to the browser along with them.
 *
 * Still global on purpose: one row of the legacy `settings` table, shared by every account, until each
 * user has their own encrypted keys (#126). Everything else moved to `user_settings`.
 */
const KEY = "api-keys";

type StoredKeys = Partial<Record<KeyProvider, string>>;

function getStoredKeys(): StoredKeys {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  return (row?.value as StoredKeys | undefined) ?? {};
}

export function setApiKey(provider: KeyProvider, apiKey: string | null) {
  const keys = getStoredKeys();
  if (apiKey?.trim()) keys[provider] = apiKey.trim();
  else delete keys[provider];

  db.insert(schema.settings)
    .values({ key: KEY, value: keys })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: keys } })
    .run();
}

export function resolveApiKey(provider: KeyProvider) {
  return pickApiKey(getStoredKeys()[provider], serverEnv()[KEY_ENV_VARS[provider]]);
}
