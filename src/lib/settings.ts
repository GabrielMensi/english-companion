import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { PROVIDER_IDS, PROVIDERS } from "@/lib/ai/provider-info";

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
  /** Ollama server URL; null uses OLLAMA_BASE_URL or the default. */
  ollamaBaseUrl: z.url({ protocol: /^https?$/ }).nullable(),
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
  ollamaBaseUrl: null,
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
  };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function saveSettings(value: Settings): Settings {
  db.insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
  return value;
}
