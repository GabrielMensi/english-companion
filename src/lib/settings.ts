import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeChain } from "@/lib/ai/fallback";
import { DEFAULT_SETTINGS, needsRewrite, type Settings, upgradeSettings } from "@/lib/settings-core";

export { settingsSchema, type Settings } from "@/lib/settings-core";

const KEY = "app";

export function getSettings(): Settings {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  const settings = upgradeSettings(row.value);
  if (!settings) return DEFAULT_SETTINGS;
  if (needsRewrite(row.value, settings)) persistUpgrade(row.value, settings);
  return settings;
}

/**
 * Saves the upgraded settings once, so older rows don't stay old until the next save. The update
 * only applies while the row still holds what was read: a save in between wins, and once the row
 * is up to date reads write nothing.
 */
function persistUpgrade(read: unknown, settings: Settings) {
  try {
    db.update(schema.settings)
      .set({ value: settings })
      .where(and(eq(schema.settings.key, KEY), sql`json(${schema.settings.value}) = json(${JSON.stringify(read)})`))
      .run();
  } catch (error) {
    // Reading settings must not fail because of this; the upgrade is retried on the next read.
    console.warn("Could not save the upgraded settings:", error);
  }
}

export function saveSettings(settings: Settings): Settings {
  const value = { ...settings, ...normalizeChain(settings) };
  db.insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
  return value;
}
