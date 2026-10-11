/** Settings format and its upgrade from older versions (no server-only imports, unit tested). */
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
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

/**
 * The settings a stored row means today. Settings saved by older versions are merged with the
 * defaults so they stay valid; keys that no longer exist (like Ollama's model and URL) are
 * dropped. Null when the row can't be read as settings, so the caller uses the defaults
 * without overwriting it.
 */
export function upgradeSettings(stored: unknown): Settings | null {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return null;
  const saved = stored as Partial<Record<keyof Settings, unknown>>;
  const parsed = settingsSchema.safeParse({
    ...DEFAULT_SETTINGS,
    ...saved,
    // A model id that's no longer valid falls back to the default instead of resetting everything.
    models: savedModels(DEFAULT_SETTINGS.models, saved.models),
    // Without this, a chain that still names Ollama would fail to parse and reset every setting.
    ...upgradeChain(saved, DEFAULT_SETTINGS.provider),
    version: SETTINGS_VERSION,
  });
  return parsed.success ? { ...parsed.data, ...normalizeChain(parsed.data) } : null;
}

/** Whether the stored row must be rewritten to hold `upgraded` (false once it's up to date). */
export function needsRewrite(stored: unknown, upgraded: Settings): boolean {
  return !isDeepStrictEqual(stored, upgraded);
}
