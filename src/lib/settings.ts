import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { normalizeChain, upgradeChain } from "@/lib/ai/fallback";
import { PROVIDER_IDS, PROVIDERS } from "@/lib/ai/provider-info";
import { MAX_SESSION_CARDS, NEW_CARDS_PER_SESSION } from "@/lib/flashcards-core";
import { modelIdSchema, savedModels } from "@/lib/model-id";

/**
 * 2: the fallback order is the user's (before, remote providers were always tried first).
 * 3: Ollama was removed; its model and URL are dropped and it leaves the chain.
 */
const SETTINGS_VERSION = 3;

export const settingsSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  models: z.object({
    gemini: modelIdSchema,
    groq: modelIdSchema,
  }),
  /** Language used for error explanations. */
  explanationLanguage: z.enum(["es", "en"]),
  /** Whether typos count towards the dashboard statistics. */
  countTyposInStats: z.boolean(),
  /** Providers to try, in this order, when the selected one fails. Never includes `provider`. */
  fallbacks: z.array(z.enum(PROVIDER_IDS)),
  /** How many never-seen flashcards a study session adds after the due ones. */
  newCardsPerSession: z.number().int().min(0).max(MAX_SESSION_CARDS),
  /** Format version, to migrate settings saved by older versions. */
  version: z.literal(SETTINGS_VERSION),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "gemini",
  models: {
    gemini: PROVIDERS.gemini.defaultModel,
    groq: PROVIDERS.groq.defaultModel,
  },
  explanationLanguage: "es",
  countTyposInStats: false,
  fallbacks: PROVIDER_IDS.filter((p) => p !== "gemini"),
  newCardsPerSession: NEW_CARDS_PER_SESSION,
  version: SETTINGS_VERSION,
};

const KEY = "app";

export function getSettings(): Settings {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  // Merge with defaults so settings saved by older versions stay valid. Unknown
  // keys (like Ollama's model and URL) are dropped by the schema.
  const stored = row.value as Partial<Settings>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    // A model id that's no longer valid falls back to the default instead of resetting everything.
    models: savedModels(DEFAULT_SETTINGS.models, stored.models),
    // Without this, a chain that still names Ollama would fail to parse and reset every setting.
    ...upgradeChain(stored, DEFAULT_SETTINGS.provider),
    version: SETTINGS_VERSION,
  };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? { ...parsed.data, ...normalizeChain(parsed.data) } : DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): Settings {
  const value = { ...settings, ...normalizeChain(settings) };
  db.insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
  return value;
}
