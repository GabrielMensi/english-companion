import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { generateText } from "ai";
import { type KeyProvider, maskKey } from "@/lib/credentials";
import { resolveApiKey } from "@/lib/secrets";
import type { Settings } from "@/lib/settings";
import { fallbackOrder, runWithFallback } from "./fallback";
import { NO_PROVIDER_MESSAGE, PROVIDER_IDS, type ProviderId, PROVIDERS } from "./provider-info";

export interface ProviderStatus {
  configured: boolean;
  /** Where the credential comes from; null when there is none. */
  source: "app" | "env" | null;
  /** Masked API key. Never the full key. */
  detail: string | null;
}

export function providerStatus(): Record<ProviderId, ProviderStatus> {
  const keyStatus = (provider: KeyProvider): ProviderStatus => {
    const resolved = resolveApiKey(provider);
    return resolved
      ? { configured: true, source: resolved.source, detail: maskKey(resolved.key) }
      : { configured: false, source: null, detail: null };
  };
  return {
    gemini: keyStatus("gemini"),
    groq: keyStatus("groq"),
  };
}

function requireApiKey(provider: KeyProvider): string {
  const resolved = resolveApiKey(provider);
  if (!resolved) {
    throw new Error(`Missing ${PROVIDERS[provider].label} API key. Add it in Settings.`);
  }
  return resolved.key;
}

type CallSettings = Pick<
  Parameters<typeof generateText>[0],
  "model" | "providerOptions" | "maxRetries" | "temperature" | "timeout"
>;

// A hung provider must fail (and fall back) instead of waiting forever.
const TIMEOUT_MS = 60_000;

export interface ResolvedModel {
  provider: ProviderId;
  modelId: string;
  /**
   * Settings to spread into every `generateText` call. `retry: false` skips the
   * SDK's retries, used when another model can take over right away.
   */
  call: (options: { temperature: number; retry?: boolean }) => CallSettings;
}

export function resolveModel(settings: Settings, provider: ProviderId = settings.provider): ResolvedModel {
  const modelId = settings.models[provider];

  switch (provider) {
    case "gemini": {
      const model = createGoogleGenerativeAI({ apiKey: requireApiKey("gemini") })(modelId);
      return {
        provider,
        modelId,
        call: ({ temperature, retry = true }) => ({
          model,
          temperature,
          maxRetries: retry ? 2 : 0,
          timeout: TIMEOUT_MS,
        }),
      };
    }
    case "groq": {
      const model = createGroq({ apiKey: requireApiKey("groq") })(modelId);
      return {
        provider,
        modelId,
        call: ({ temperature, retry = true }) => ({
          model,
          temperature,
          maxRetries: retry ? 2 : 0,
          timeout: TIMEOUT_MS,
        }),
      };
    }
  }
}

function isConfigured(provider: ProviderId): boolean {
  return resolveApiKey(provider) !== null;
}

/** Whether any provider has an API key; without one no AI feature works. */
export function hasConfiguredProvider(): boolean {
  return PROVIDER_IDS.some(isConfigured);
}

/** Providers the user can pick: every provider with an API key, and the selected one. */
export function availableModels(settings: Settings) {
  return PROVIDER_IDS.filter((p) => p === settings.provider || isConfigured(p)).map((provider) => ({
    provider,
    name: PROVIDERS[provider].name,
    model: settings.models[provider],
  }));
}

/**
 * Runs `run` with the selected model and, if it fails, with each configured
 * fallback in order. Retries are skipped while another model can take over.
 */
export function withFallback<T>(
  settings: Settings,
  run: (model: ResolvedModel, options: { isLast: boolean }) => Promise<T>,
) {
  // Say what to do instead of "missing Gemini API key" when there's no key at all.
  if (!hasConfiguredProvider()) return Promise.reject(new Error(NO_PROVIDER_MESSAGE));
  const candidates = fallbackOrder(settings.provider, settings.fallbacks, isConfigured).map((provider) => ({
    provider,
    modelId: settings.models[provider],
  }));
  return runWithFallback(candidates, (candidate, options) => run(resolveModel(settings, candidate.provider), options));
}

/**
 * Speech-to-text for dictation. Whisper large-v3-turbo on Groq kept the most
 * mistakes without inventing text in the Phase 0 eval (docs/voice/VOICE.md), is free
 * for ~8 h of audio a day and answers in under a second. Null without a Groq key.
 */
export const TRANSCRIPTION_MODEL = { provider: "groq", modelId: "whisper-large-v3-turbo" } as const;

type GroqTranscriptionModel = ReturnType<ReturnType<typeof createGroq>["transcription"]>;

export function resolveTranscriptionModel(): {
  model: GroqTranscriptionModel;
  provider: string;
  modelId: string;
} | null {
  const resolved = resolveApiKey("groq");
  if (!resolved) return null;
  return {
    model: createGroq({ apiKey: resolved.key }).transcription(TRANSCRIPTION_MODEL.modelId),
    ...TRANSCRIPTION_MODEL,
  };
}

/** Lists the models available for a provider (used by the settings page). */
export async function listModels(provider: ProviderId): Promise<string[]> {
  const signal = AbortSignal.timeout(5000);
  switch (provider) {
    case "gemini": {
      const key = resolveApiKey("gemini")?.key;
      if (!key) return [];
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": key },
        signal,
      });
      if (!res.ok)
        throw new Error(
          res.status === 400 || res.status === 403 ? "Invalid Gemini API key" : `Gemini responded ${res.status}`,
        );
      const data = (await res.json()) as {
        models: { name: string; supportedGenerationMethods?: string[] }[];
      };
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .sort();
    }
    case "groq": {
      const key = resolveApiKey("groq")?.key;
      if (!key) return [];
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Invalid Groq API key" : `Groq responded ${res.status}`);
      const data = (await res.json()) as { data: { id: string }[] };
      return data.data.map((m) => m.id).sort();
    }
  }
}
