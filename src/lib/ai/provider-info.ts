/** Provider metadata shared by the server and the settings UI (no secrets here). */
export const PROVIDER_IDS = ["ollama", "gemini", "groq"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDERS: Record<
  ProviderId,
  { label: string; name: string; description: string; defaultModel: string; local: boolean }
> = {
  ollama: {
    label: "Ollama (local)",
    name: "Ollama",
    description: "Runs on your PC. Free and private.",
    defaultModel: "gemma4:12b",
    local: true,
  },
  gemini: {
    label: "Google Gemini",
    name: "Gemini",
    description: "Free tier, no credit card (Flash-Lite: ~500 requests/day). Note: on the free plan Google may use your data.",
    defaultModel: "gemini-flash-lite-latest",
    local: false,
  },
  groq: {
    label: "Groq",
    name: "Groq",
    description: "Free tier: 1,000 requests and 200K tokens a day (~110 corrections with Qwen). Very fast.",
    defaultModel: "qwen/qwen3.8-27b",
    local: false,
  },
};

/** "Gemini · gemini-flash-latest". Accepts unknown providers stored in old rows. */
export function modelLabel(provider: string, model: string): string {
  const name = PROVIDERS[provider as ProviderId]?.name ?? provider;
  return `${name} · ${model}`;
}

export interface ModelInfo {
  /** Score in `pnpm eval:models` (0–100); missing when it wasn't evaluated. */
  score?: number;
  /** Average seconds per correction in the same eval. */
  seconds?: number;
  /** Free-tier daily limit, for remote models. */
  freeLimit?: string;
  note?: string;
}

/**
 * What the settings page shows to help pick a model. Results of `pnpm
 * eval:models` from September 2026 (see README.md); update both together.
 */
export const MODEL_INFO: Record<string, ModelInfo> = {
  "gemini-flash-lite-latest": { score: 96, seconds: 2, freeLimit: "~500 requests/day", note: "The most accurate." },
  "gemini-flash-latest": { freeLimit: "~20 requests/day", note: "More capable than Flash-Lite, but a very small free tier." },
  "qwen/qwen3.8-27b": { score: 93, seconds: 2, freeLimit: "~110 corrections/day", note: "Very fast." },
  "openai/gpt-oss-120b": {
    score: 81,
    seconds: 13,
    freeLimit: "~60 corrections/day",
    note: "Spends many reasoning tokens and sometimes returns invalid JSON.",
  },
  "gemma4:12b": { score: 93, seconds: 9, note: "The best local model; catches false friends." },
  "qwen3:14b": { score: 91, seconds: 7, note: "Misses some meaning errors." },
  "qwen2.5:14b-instruct": { score: 89, seconds: 8 },
  "gpt-oss:20b": { score: 84, seconds: 34, note: "Always reasons: too slow to chat." },
};
