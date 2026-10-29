import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { normalizeChain } from "@/lib/ai/fallback";
import { DEFAULT_SETTINGS, needsRewrite, type Settings, upgradeSettings } from "@/lib/settings-core";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

export { settingsSchema, type Settings } from "@/lib/settings-core";

const KEY = "app";

/** The user's settings; a user who never saved any gets the defaults. */
export function getSettings(userId: string): Settings {
  const value = getUserSetting(userId, KEY);
  if (value === undefined) return DEFAULT_SETTINGS;
  const settings = upgradeSettings(value);
  if (!settings) return DEFAULT_SETTINGS;
  if (needsRewrite(value, settings)) persistUpgrade(userId, value, settings);
  return settings;
}

/**
 * Saves the upgraded settings once, so older rows don't stay old until the next save. The update
 * only applies while the row still holds what was read: a save in between wins, and once the row
 * is up to date reads write nothing.
 */
function persistUpgrade(userId: string, read: unknown, settings: Settings) {
  try {
    db.update(schema.userSettings)
      .set({ value: settings })
      .where(
        and(
          eq(schema.userSettings.userId, userId),
          eq(schema.userSettings.key, KEY),
          sql`json(${schema.userSettings.value}) = json(${JSON.stringify(read)})`,
        ),
      )
      .run();
  } catch {
    // Reading settings must not fail because of this (e.g. the database is busy); the next read retries.
  }
}

export function saveSettings(userId: string, settings: Settings): Settings {
  const value = { ...settings, ...normalizeChain(settings) };
  setUserSetting(userId, KEY, value);
  return value;
}
