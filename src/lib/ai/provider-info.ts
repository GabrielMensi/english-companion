/** Provider metadata shared by the server and the settings UI (no secrets here). */
export const PROVIDER_IDS = ["ollama", "gemini", "groq"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDERS: Record<
  ProviderId,
  { label: string; description: string; defaultModel: string; local: boolean }
> = {
  ollama: {
    label: "Ollama (local)",
    description: "Modelo corriendo en tu PC. Gratis y privado.",
    defaultModel: "qwen3:14b",
    local: true,
  },
  gemini: {
    label: "Google Gemini",
    description: "Free tier sin tarjeta. Ojo: en el plan gratis Google puede usar los datos.",
    defaultModel: "gemini-flash-latest",
    local: false,
  },
  groq: {
    label: "Groq",
    description: "Free tier con límite diario. Muy rápido.",
    defaultModel: "openai/gpt-oss-120b",
    local: false,
  },
};
