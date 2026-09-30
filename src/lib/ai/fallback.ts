/**
 * Pure fallback logic: try the selected model first, then the configured
 * fallbacks in the order the user chose. Kept free of server-only imports so it can be tested.
 */
import { NoObjectGeneratedError } from "ai";
import { PROVIDER_IDS, type ProviderId, PROVIDERS } from "./provider-info";

export interface FallbackAttempt {
  provider: ProviderId;
  model: string;
  /** Short, user-facing reason, e.g. "quota exceeded". */
  reason: string;
}

/**
 * Remote providers first, local ones last, because a local model is slower and
 * takes the GPU. Only used to migrate settings saved before the order was editable.
 */
export function byFallbackPriority(providers: readonly ProviderId[]): ProviderId[] {
  return [...providers].sort((a, b) => Number(PROVIDERS[a].local) - Number(PROVIDERS[b].local));
}

/** The primary model and its fallbacks, in the order they're tried. */
export interface Chain {
  provider: ProviderId;
  fallbacks: ProviderId[];
}

/** Primary first, then each enabled fallback that is configured, in the saved order, without duplicates. */
export function fallbackOrder(
  primary: ProviderId,
  fallbacks: readonly ProviderId[],
  isConfigured: (provider: ProviderId) => boolean,
): ProviderId[] {
  return [...new Set([primary, ...fallbacks.filter((p) => p !== primary && isConfigured(p))])];
}

/** Drops duplicates and the primary from the fallbacks. */
export function normalizeChain({ provider, fallbacks }: Chain): Chain {
  return { provider, fallbacks: [...new Set(fallbacks)].filter((p) => p !== provider) };
}

/** Every provider as a step of the chain: enabled ones in order, then the disabled ones. */
export function chainSteps(chain: Chain): { provider: ProviderId; enabled: boolean }[] {
  const { provider, fallbacks } = normalizeChain(chain);
  const enabled = [provider, ...fallbacks];
  return [
    ...enabled.map((p) => ({ provider: p, enabled: true })),
    ...PROVIDER_IDS.filter((p) => !enabled.includes(p)).map((p) => ({ provider: p, enabled: false })),
  ];
}

function fromList([provider, ...fallbacks]: ProviderId[]): Chain {
  return { provider, fallbacks };
}

/** Moves an enabled step one place up or down. Moving to the top makes it the primary. */
export function moveStep(chain: Chain, id: ProviderId, direction: -1 | 1): Chain {
  const { provider, fallbacks } = normalizeChain(chain);
  const list = [provider, ...fallbacks];
  const from = list.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= list.length) return chain;
  [list[from], list[to]] = [list[to], list[from]];
  return fromList(list);
}

/** Makes a provider the primary; the previous primary becomes the first fallback. */
export function setPrimary(chain: Chain, id: ProviderId): Chain {
  const { provider, fallbacks } = normalizeChain(chain);
  if (id === provider) return { provider, fallbacks };
  return fromList([id, provider, ...fallbacks.filter((p) => p !== id)]);
}

/** Turns a fallback on (added last) or off. The primary can't be turned off. */
export function toggleStep(chain: Chain, id: ProviderId, on: boolean): Chain {
  const { provider, fallbacks } = normalizeChain(chain);
  if (id === provider) return { provider, fallbacks };
  const rest = fallbacks.filter((p) => p !== id);
  return { provider, fallbacks: on ? [...rest, id] : rest };
}

export class AllModelsFailedError extends Error {
  constructor(
    readonly attempts: FallbackAttempt[],
    readonly lastError: unknown,
  ) {
    super(errorToMessage(lastError));
    this.name = "AllModelsFailedError";
  }
}

/**
 * Runs `run` with each candidate until one succeeds. Returns the result, the
 * candidate that produced it and the attempts that failed before it.
 */
export async function runWithFallback<C extends { provider: ProviderId; modelId: string }, T>(
  candidates: C[],
  run: (candidate: C, options: { isLast: boolean }) => Promise<T>,
): Promise<{ result: T; used: C; failed: FallbackAttempt[] }> {
  const failed: FallbackAttempt[] = [];
  let lastError: unknown = new Error("No AI provider is configured.");

  for (const [i, candidate] of candidates.entries()) {
    try {
      const result = await run(candidate, { isLast: i === candidates.length - 1 });
      return { result, used: candidate, failed };
    } catch (error) {
      lastError = error;
      failed.push({ provider: candidate.provider, model: candidate.modelId, reason: shortReason(error) });
    }
  }
  throw new AllModelsFailedError(failed, lastError);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const UNREACHABLE = /Cannot connect to API|ECONNREFUSED|fetch failed|Connect Timeout/i;
const TIMED_OUT = /aborted due to timeout|timed out|TimeoutError/i;
const QUOTA = /429|rate limit|quota|RESOURCE_EXHAUSTED/i;
const OVERLOADED = /503|high demand|overloaded|UNAVAILABLE/i;
const INVALID_KEY = /API key not valid|invalid api key|401|PERMISSION_DENIED/i;

/** A few words describing why a model failed, for the "fallback" note. */
export function shortReason(error: unknown): string {
  const message = messageOf(error);
  if (UNREACHABLE.test(message)) return "unreachable";
  if (TIMED_OUT.test(message)) return "timed out";
  if (QUOTA.test(message)) return "quota exceeded";
  if (OVERLOADED.test(message)) return "overloaded";
  if (INVALID_KEY.test(message)) return "invalid API key";
  if (NoObjectGeneratedError.isInstance(error)) return "invalid response";
  if (/not found/i.test(message) && /model/i.test(message)) return "model not found";
  if (/Missing .* API key/i.test(message)) return "missing API key";
  return message.length > 80 ? `${message.slice(0, 77)}…` : message;
}

/** Full, user-facing error message. */
export function errorToMessage(error: unknown): string {
  if (error instanceof AllModelsFailedError) {
    const tried = error.attempts.map((a) => `${a.model} (${a.reason})`).join(", ");
    const detail = errorToMessage(error.lastError);
    return error.attempts.length > 1 ? `All models failed: ${tried}. ${detail}` : detail;
  }
  const message = messageOf(error);
  if (UNREACHABLE.test(message)) {
    return "Couldn't connect to the AI provider. If you use Ollama, make sure it's running and the model is downloaded.";
  }
  if (TIMED_OUT.test(message)) {
    return "The model took too long to respond. Try again or switch to a faster model.";
  }
  if (/not found/i.test(message) && /model/i.test(message)) {
    return `${message}. Check the model name in Settings.`;
  }
  if (QUOTA.test(message)) {
    return "The provider's free tier limit was reached. Wait a while or switch providers.";
  }
  if (OVERLOADED.test(message)) {
    return "The provider is overloaded right now. Try again in a moment or switch providers.";
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The model didn't return a response in the expected format. Try again or use a bigger model.";
  }
  return message;
}
