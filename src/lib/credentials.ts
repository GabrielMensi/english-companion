/** Pure helpers for API credentials (no server-only imports, unit tested). */

export const KEY_PROVIDERS = ["gemini", "groq"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/** Environment variable used as fallback when no key is saved in the app. */
export const KEY_ENV_VARS: Record<KeyProvider, string> = {
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
};

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Shows only the last characters, so the UI can tell keys apart without exposing them. */
export function maskKey(key: string): string {
  const visible = key.length >= 12 ? 4 : 2;
  return `••••${key.slice(-visible)}`;
}

/** A key saved in the app wins over the environment variable. */
export function pickApiKey(
  stored: string | undefined,
  env: string | undefined,
): { key: string; source: "app" | "env" } | null {
  if (stored?.trim()) return { key: stored.trim(), source: "app" };
  if (env?.trim()) return { key: env.trim(), source: "env" };
  return null;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
