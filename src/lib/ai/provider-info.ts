/** Provider metadata shared by the server and the settings UI (no secrets here). */
export const PROVIDER_IDS = ["ollama", "gemini", "groq"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDERS: Record<
  ProviderId,
  { label: string; description: string; defaultModel: string; local: boolean }
> = {
  ollama: {
    label: "Ollama (local)",
    description: "Runs on your PC. Free and private.",
    defaultModel: "qwen3:14b",
    local: true,
  },
  gemini: {
    label: "Google Gemini",
    description: "Free tier, no credit card. Note: on the free plan Google may use your data.",
    defaultModel: "gemini-flash-latest",
    local: false,
  },
  groq: {
    label: "Groq",
    description: "Free tier with daily limits. Very fast.",
    defaultModel: "openai/gpt-oss-120b",
    local: false,
  },
};
