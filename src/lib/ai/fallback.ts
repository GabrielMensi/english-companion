/**
 * Pure fallback logic: try the selected model first, then the configured
 * fallbacks in order. Kept free of server-only imports so it can be tested.
 */
import { NoObjectGeneratedError } from "ai";
import type { ProviderId } from "./provider-info";

export interface FallbackAttempt {
  provider: ProviderId;
  model: string;
  /** Short, user-facing reason, e.g. "quota exceeded". */
  reason: string;
}

/** Primary first, then each enabled fallback that is configured, without duplicates. */
export function fallbackOrder(
  primary: ProviderId,
  fallbacks: readonly ProviderId[],
  isConfigured: (provider: ProviderId) => boolean,
): ProviderId[] {
  const order = [primary, ...fallbacks.filter((p) => p !== primary && isConfigured(p))];
  return [...new Set(order)];
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
