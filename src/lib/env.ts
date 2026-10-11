/**
 * The environment variables the app reads, validated with zod (no server-only imports, unit tested:
 * proxy.ts reads it too). Everything is optional: API keys can be saved from Settings instead, and
 * paths have defaults. Only invalid values fail, at startup (instrumentation.ts) with a message that
 * names each variable. `NODE_ENV` is Next's and isn't listed here.
 */
import { z } from "zod";

/** An empty or blank value (`GROQ_API_KEY=` in .env.local) counts as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema);
}

const text = z.string().trim();

const envSchema = z.object({
  /** SQLite database file. */
  DATABASE_PATH: optional(text.default("data/companion.db")),
  /** Recordings for the speech-to-text eval. */
  ASR_SAMPLES_DIR: optional(text.default("data/asr-samples")),
  /** Fallbacks when no key is saved in Settings. */
  GOOGLE_GENERATIVE_AI_API_KEY: optional(text.optional()),
  GROQ_API_KEY: optional(text.optional()),
});

export type Env = z.infer<typeof envSchema>;

/** Parses the variables, or throws an error listing each invalid one (never its value: it may be a key). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment variables (check .env.local):\n${problems.join("\n")}`);
}

/**
 * The current environment. Parsed on every call (it's a handful of variables), so a `.env.local` that
 * `next dev` reloads is picked up like a direct `process.env` read would.
 */
export function serverEnv(): Env {
  return parseEnv(process.env);
}
