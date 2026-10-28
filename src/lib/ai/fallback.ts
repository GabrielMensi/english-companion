/**
 * Pure fallback logic: try the selected model first, then the configured
 * fallbacks in the order the user chose. Kept free of server-only imports so it can be tested.
 */
import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, RetryError } from "ai";
import { PROVIDER_IDS, type ProviderId } from "./provider-info";

export interface FallbackAttempt {
  provider: ProviderId;
  model: string;
  /** Short, user-facing reason, e.g. "quota exceeded". */
  reason: string;
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

function isProviderId(value: unknown): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

/**
 * The chain saved by an older version, without providers that no longer exist
 * (Ollama, removed in settings v3). If the primary was one of them, the first
 * remaining fallback takes its place; with none left, `defaultProvider` does.
 * Without a saved `fallbacks` key, every other provider is a fallback (the default).
 */
export function upgradeChain(stored: { provider?: unknown; fallbacks?: unknown }, defaultProvider: ProviderId): Chain {
  if (stored.fallbacks === undefined) {
    const provider = isProviderId(stored.provider) ? stored.provider : defaultProvider;
    return normalizeChain({ provider, fallbacks: [...PROVIDER_IDS] });
  }
  const fallbacks = Array.isArray(stored.fallbacks) ? stored.fallbacks.filter(isProviderId) : [];
  if (isProviderId(stored.provider)) return normalizeChain({ provider: stored.provider, fallbacks });
  const [provider = defaultProvider, ...rest] = fallbacks;
  return normalizeChain({ provider, fallbacks: rest });
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

/** An error whose message is written for the user, so it can be shown as is. */
export class UserFacingError extends Error {}

/**
 * Whether the message comes from this app's code (`new Error("...")` or a {@link UserFacingError}).
 * Anything else (provider responses, library and runtime errors) may carry raw details, like the
 * provider's own wording, request ids or internal paths, so it's never shown verbatim.
 */
export function isOwnError(error: unknown): error is Error {
  return (
    error instanceof UserFacingError || (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype)
  );
}

/** The HTTP status a provider answered with, when the error came from its API (also after the SDK's retries). */
export function statusOf(error: unknown): number | undefined {
  if (RetryError.isInstance(error)) return statusOf(error.lastError);
  return APICallError.isInstance(error) ? error.statusCode : undefined;
}

const UNREACHABLE = /Cannot connect to API|ECONNREFUSED|fetch failed|Connect Timeout/i;
const TIMED_OUT = /aborted due to timeout|timed out|TimeoutError/i;
// "Request too large" means the request alone is over the limit (Groq answers 413, or a 429 with this text):
// waiting never helps. A normal per-minute rate limit ("Rate limit reached ... tokens per minute ... try again
// in 3s") is temporary and stays "quota exceeded".
const TOO_LARGE = /request too large|payload too large/i;
// The model ran out of output tokens before finishing the JSON (Groq: "max completion tokens reached").
const OUTPUT_TRUNCATED =
  /max(?:imum)? completion tokens|max_completion_tokens|output was truncated|finish.?reason.{0,10}length/i;
const QUOTA = /429|rate limit|quota|RESOURCE_EXHAUSTED/i;
const OVERLOADED = /503|high demand|overloaded|UNAVAILABLE/i;
const INVALID_KEY = /API key not valid|invalid api key|401|PERMISSION_DENIED/i;

/** Whether the provider refused the request for being bigger than its token or size limits, or cut the answer short for the same reason: long, error-heavy messages on a free tier. */
export function isRequestTooLarge(error: unknown): boolean {
  if (RetryError.isInstance(error)) return isRequestTooLarge(error.lastError);
  return statusOf(error) === 413 || TOO_LARGE.test(messageOf(error)) || OUTPUT_TRUNCATED.test(messageOf(error));
}

/** A few words describing why a model failed, for the "fallback" note. */
export function shortReason(error: unknown): string {
  const message = messageOf(error);
  if (UNREACHABLE.test(message)) return "unreachable";
  if (TIMED_OUT.test(message)) return "timed out";
  if (isRequestTooLarge(error)) return "request too large";
  if (QUOTA.test(message)) return "quota exceeded";
  if (OVERLOADED.test(message)) return "overloaded";
  if (INVALID_KEY.test(message)) return "invalid API key";
  if (NoObjectGeneratedError.isInstance(error)) return "invalid response";
  if (/not found/i.test(message) && /model/i.test(message)) return "model not found";
  if (/Missing .* API key/i.test(message) || LoadAPIKeyError.isInstance(error)) return "missing API key";
  if (!isOwnError(error)) {
    const status = statusOf(error);
    return status ? `provider error ${status}` : "provider error";
  }
  return message.length > 80 ? `${message.slice(0, 77)}…` : message;
}

// Failures that would happen again with the same model without streaming, so it's better to move on.
const SAME_WITHOUT_STREAMING = new Set([
  "unreachable",
  "timed out",
  "quota exceeded",
  "request too large",
  "overloaded",
  "invalid API key",
  "model not found",
  "missing API key",
]);

/**
 * Whether a failed streaming call is worth repeating with the same model without streaming. Invalid
 * output and provider-specific streaming problems are; a server that is down or out of quota isn't:
 * that model is skipped right away, as it is when not streaming.
 */
export function canRetryWithoutStreaming(error: unknown): boolean {
  return !SAME_WITHOUT_STREAMING.has(shortReason(error));
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
    return "Couldn't connect to the AI provider. Check your internet connection and try again.";
  }
  if (TIMED_OUT.test(message)) {
    return "The model took too long to respond. Try again or switch to a faster model.";
  }
  if (/not found/i.test(message) && /model/i.test(message)) {
    return isOwnError(error)
      ? `${message}. Check the model name in Settings.`
      : "The provider doesn't have that model. Check the model name in Settings.";
  }
  if (isRequestTooLarge(error)) {
    return "This message is too long for the provider's free tier limit. Try a shorter message or add another provider in Settings.";
  }
  if (QUOTA.test(message)) {
    return "The provider's free tier limit was reached. Wait a while or switch providers.";
  }
  if (OVERLOADED.test(message)) {
    return "The provider is overloaded right now. Try again in a moment or switch providers.";
  }
  if (LoadAPIKeyError.isInstance(error)) {
    return "The AI provider's API key is missing. Add it in Settings.";
  }
  if (!isOwnError(error) && INVALID_KEY.test(message)) {
    return "The provider rejected the API key. Check it in Settings.";
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The model didn't return a response in the expected format. Try again or use a bigger model.";
  }
  if (isOwnError(error)) return message;
  // The route logs the details that are safe to log (see server-log.ts).
  const status = statusOf(error);
  return `The AI provider returned an error${status ? ` (HTTP ${status})` : ""}. Try again or switch providers.`;
}
