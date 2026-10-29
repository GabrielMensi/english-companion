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

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
/** An IPv6 literal in brackets, as browsers send it in Host ("[::1]", "[2001:db8::1]"). */
const IPV6_LITERAL = /^\[[0-9a-f:.]*:[0-9a-f:.]*\]$/i;

/** "true"/"false" or "1"/"0", nothing else: a typo like "ture" shouldn't silently mean false. */
const flag = z
  .enum(["true", "false", "1", "0"], { error: 'expected "true", "false", "1" or "0"' })
  .transform((value) => value === "true" || value === "1");

/** Comma-separated hostnames or bracketed IPv6 literals, without scheme or port ("companion.example.com,[2001:db8::1]"). */
const hostnames = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((hosts) => hosts.every((host) => HOSTNAME.test(host) || IPV6_LITERAL.test(host)), {
    error:
      "expected comma-separated hostnames or [IPv6] literals without scheme, port or path (e.g. companion.example.com)",
  });

/** Comma-separated emails, lowercased ("ana@example.com,bruno@example.com"). */
const emails = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((list) => list.every((email) => z.email().safeParse(email).success), {
    error: "expected comma-separated email addresses (e.g. ana@example.com,bruno@example.com)",
  });

/** A server encryption key: 32 random bytes in base64 (`openssl rand -base64 32`). */
const encryptionKey = z
  .string()
  .trim()
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    error: "expected 32 random bytes in base64 (openssl rand -base64 32)",
  });

const envSchema = z.object({
  /** SQLite database file. */
  DATABASE_PATH: optional(text.default("data/companion.db")),
  /** Recordings for the speech-to-text eval. */
  ASR_SAMPLES_DIR: optional(text.default("data/asr-samples")),
  /** Where the phoneme model for the read-aloud sound check is downloaded (~320 MB, once). */
  PHONEME_MODEL_DIR: optional(text.default("data/models")),
  /** "false" turns the sound check off: no download, no inference. */
  PHONEME_CHECK: optional(flag.default(true)),
  /**
   * Encrypts the API keys saved in Settings. Locally it's generated once in `encryption.key` next to the database
   * (lib/encryption-key.ts); a deploy must set it. Losing it only means pasting the keys again.
   */
  APP_ENCRYPTION_KEY: optional(encryptionKey.optional()),
  /** Previous encryption keys, comma-separated, kept while rotating (see `pnpm keys:reencrypt`). */
  APP_ENCRYPTION_KEYS_OLD: optional(
    z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      )
      .pipe(z.array(encryptionKey))
      .default([]),
  ),
  /**
   * Whether the keys below serve every account that has no key of its own (default: yes, so a single
   * local user keeps working). A deploy should set it to false: everyone brings their own.
   */
  SHARED_KEYS: optional(flag.default(true)),
  /** Fallbacks when no key is saved in Settings (see SHARED_KEYS). */
  GOOGLE_GENERATIVE_AI_API_KEY: optional(text.optional()),
  GROQ_API_KEY: optional(text.optional()),
  /** Hostnames the app answers to besides localhost, 127.0.0.1 and [::1] (see allowed-hosts.ts). */
  ALLOWED_HOSTS: optional(hostnames.default([])),
  /** Behind a reverse proxy: use X-Forwarded-Host instead of Host (allowed hosts and cross-site checks). */
  TRUST_PROXY: optional(flag.default(false)),
  /** Signs the login cookies. Locally it's generated once in a file next to the database (lib/auth/secret.ts). */
  BETTER_AUTH_SECRET: optional(text.min(32, "expected at least 32 characters (openssl rand -base64 32)").optional()),
  /** The public URL of a deploy (https://companion.example.com). Locally it's inferred from the request. */
  BETTER_AUTH_URL: optional(z.url({ protocol: /^https?$/ }).optional()),
  /** Emails that can create an account. Empty: only the first account can be created. */
  SIGNUP_ALLOWED_EMAILS: optional(emails.default([])),
  /** Turns on the speech-to-text eval (recordings are written to disk). Off in a deploy unless set. */
  ENABLE_EVAL: optional(flag.optional()),
  /**
   * Apply pending migrations when the app opens the database (default). The container sets it to false:
   * migrations run as a deploy step, after a backup (`pnpm db:migrate`, see docs/platform/DEPLOY.md).
   */
  MIGRATE_ON_START: optional(flag.default(true)),
  /** Send the Content-Security-Policy as report-only (the browser logs violations instead of blocking): a way back if it breaks something. */
  CSP_REPORT_ONLY: optional(flag.default(false)),
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

/**
 * What a deploy (`ALLOWED_HOSTS` set) can't start without. Locally the secret is generated, but a server
 * must never invent one: it would sign out every user at each restart and could not be backed up.
 */
export function deployProblems(env: Env): string[] {
  if (env.ALLOWED_HOSTS.length === 0) return [];
  const problems: string[] = [];
  if (!env.BETTER_AUTH_SECRET) problems.push("BETTER_AUTH_SECRET is required when ALLOWED_HOSTS is set");
  if (!env.BETTER_AUTH_URL) problems.push("BETTER_AUTH_URL is required when ALLOWED_HOSTS is set");
  if (!env.APP_ENCRYPTION_KEY) problems.push("APP_ENCRYPTION_KEY is required when ALLOWED_HOSTS is set");
  return problems;
}

/** Whether the eval pages and routes are on: always in development, in production only with ENABLE_EVAL. */
export function evalEnabled(env: Env, nodeEnv: string | undefined): boolean {
  return env.ENABLE_EVAL ?? nodeEnv !== "production";
}
