import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { byFallbackPriority, normalizeChain } from "@/lib/ai/fallback";
import { PROVIDER_IDS, PROVIDERS } from "@/lib/ai/provider-info";

/** 2: the fallback order is the user's (before, remote providers were always tried first). */
const SETTINGS_VERSION = 2;

export const settingsSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  models: z.object({
    ollama: z.string().min(1),
    gemini: z.string().min(1),
    groq: z.string().min(1),
  }),
  /** Language used for error explanations. */
  explanationLanguage: z.enum(["es", "en"]),
  /** Whether typos count towards the dashboard statistics. */
  countTyposInStats: z.boolean(),
  /** Providers to try, in this order, when the selected one fails. Never includes `provider`. */
  fallbacks: z.array(z.enum(PROVIDER_IDS)),
  /** Ollama server URL; null uses OLLAMA_BASE_URL or the default. */
  ollamaBaseUrl: z.url({ protocol: /^https?$/ }).nullable(),
  /** Format version, to migrate settings saved by older versions. */
  version: z.literal(SETTINGS_VERSION),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "ollama",
  models: {
    ollama: PROVIDERS.ollama.defaultModel,
    gemini: PROVIDERS.gemini.defaultModel,
    groq: PROVIDERS.groq.defaultModel,
  },
  explanationLanguage: "es",
  countTyposInStats: false,
  fallbacks: PROVIDER_IDS.filter((p) => p !== "ollama"),
  ollamaBaseUrl: null,
  version: SETTINGS_VERSION,
};

const KEY = "app";

export function getSettings(): Settings {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  // Merge with defaults so settings saved by older versions stay valid.
  const stored = row.value as Partial<Settings>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    models: { ...DEFAULT_SETTINGS.models, ...stored.models },
    // Keep the order older versions actually used: remote fallbacks first.
    ...(stored.version === undefined && stored.fallbacks && { fallbacks: byFallbackPriority(stored.fallbacks) }),
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
