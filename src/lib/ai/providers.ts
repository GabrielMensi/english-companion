import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { generateText } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { Settings } from "@/lib/settings";
import type { ProviderId } from "./provider-info";

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(
  /\/+$/,
  "",
);

export function providerStatus(): Record<ProviderId, { configured: boolean; detail: string }> {
  return {
    ollama: { configured: true, detail: OLLAMA_BASE_URL },
    gemini: {
      configured: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
      detail: "GOOGLE_GENERATIVE_AI_API_KEY",
    },
    groq: { configured: Boolean(process.env.GROQ_API_KEY), detail: "GROQ_API_KEY" },
  };
}


type CallSettings = Pick<
  Parameters<typeof generateText>[0],
  "model" | "providerOptions" | "maxRetries" | "temperature"
>;

export interface ResolvedModel {
  provider: ProviderId;
  modelId: string;
  /** Settings to spread into every `generateText` call. */
  call: (options: { temperature: number }) => CallSettings;
}

// Instructions + history + JSON output don't fit in Ollama's small default context.
const OLLAMA_CONTEXT_TOKENS = 8192;

export function resolveModel(settings: Settings): ResolvedModel {
  const provider = settings.provider;
  const modelId = settings.models[provider];

  switch (provider) {
    case "ollama": {
      const model = createOllama({ baseURL: `${OLLAMA_BASE_URL}/api` })(modelId);
      return {
        provider,
        modelId,
        call: ({ temperature }) => ({
          model,
          // A local server is either up or not: retrying only delays the error.
          maxRetries: 0,
          providerOptions: {
            ollama: {
              // Reasoning ("thinking") is much slower and doesn't improve corrections.
              think: false,
              // Ollama's native API ignores a top-level temperature; it goes in `options`.
              options: { temperature, num_ctx: OLLAMA_CONTEXT_TOKENS },
            },
          },
        }),
      };
    }
    case "gemini": {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error("Falta GOOGLE_GENERATIVE_AI_API_KEY en .env.local");
      }
      const model = createGoogleGenerativeAI()(modelId);
      return { provider, modelId, call: ({ temperature }) => ({ model, temperature, maxRetries: 2 }) };
    }
    case "groq": {
      if (!process.env.GROQ_API_KEY) {
        throw new Error("Falta GROQ_API_KEY en .env.local");
      }
      const model = createGroq()(modelId);
      return { provider, modelId, call: ({ temperature }) => ({ model, temperature, maxRetries: 2 }) };
    }
  }
}

/** Lists the models available for a provider (used by the settings page). */
export async function listModels(provider: ProviderId): Promise<string[]> {
  const signal = AbortSignal.timeout(5000);
  switch (provider) {
    case "ollama": {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal });
      if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
      const data = (await res.json()) as { models: { name: string }[] };
      return data.models.map((m) => m.name).sort();
    }
    case "gemini": {
      const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!key) return [];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`,
        { signal },
      );
      if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
      const data = (await res.json()) as {
        models: { name: string; supportedGenerationMethods?: string[] }[];
      };
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .sort();
    }
    case "groq": {
      const key = process.env.GROQ_API_KEY;
      if (!key) return [];
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      });
      if (!res.ok) throw new Error(`Groq respondió ${res.status}`);
      const data = (await res.json()) as { data: { id: string }[] };
      return data.data.map((m) => m.id).sort();
    }
  }
}
