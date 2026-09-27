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
    description: "Free tier with daily limits. Very fast.",
    defaultModel: "openai/gpt-oss-120b",
    local: false,
  },
};

/** "Gemini · gemini-flash-latest". Accepts unknown providers stored in old rows. */
export function modelLabel(provider: string, model: string): string {
  const name = PROVIDERS[provider as ProviderId]?.name ?? provider;
  return `${name} · ${model}`;
}
