/**
 * Minimal server log for route errors (no dependency, no server-only imports, unit tested). It writes
 * the route, the status and the error name; the message only for the app's own errors, scrubbed. Never
 * API keys, auth headers or learner text (messages, corrections), which provider errors can echo back.
 */

import { AllModelsFailedError, isOwnError, statusOf } from "@/lib/ai/fallback";
import { RetryError } from "ai";

const MAX_MESSAGE_LENGTH = 300;

/** Removes anything that could be a secret or learner text from an error message. */
export function scrub(message: string): string {
  return (
    message
      // Authorization-style headers and bearer tokens.
      .replace(/\b(authorization|x-api-key|api-key|x-goog-api-key)\b\s*[:=]\s*\S+(\s+\S+)?/gi, "$1: [redacted]")
      .replace(/\bBearer\s+[\w.~+/=-]+/gi, "Bearer [redacted]")
      // Keys in query strings / assignments.
      .replace(/\b(key|api_?key|token|secret)=[^&\s"']+/gi, "$1=[redacted]")
      // Well-known key shapes (Gemini, Groq, OpenAI-style) and any long opaque token.
      .replace(/\bAIza[\w-]{20,}/g, "[redacted]")
      .replace(/\b(?:gsk|sk)[-_][\w-]{16,}/g, "[redacted]")
      .replace(/\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{32,}\b/g, "[redacted]")
      // Quoted text longer than a short identifier: could be a learner's message or a correction.
      .replace(/(["'`“‘])[^"'`”’\n]{25,}?(["'`”’])/g, "$1[text]$2")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH)
  );
}

/**
 * What can be logged about an error. The app's own errors keep their (scrubbed) message. Anything else
 * (provider and AI SDK errors) logs only its name, HTTP status, code and finish reason: their messages
 * can repeat the model's output, which repeats the learner's sentences and corrections.
 */
function describeError(error: unknown): string {
  if (error instanceof AllModelsFailedError) return describeError(error.lastError);
  if (RetryError.isInstance(error)) return describeError(error.lastError);
  if (isOwnError(error)) return `${error.name}: ${scrub(error.message)}`;
  if (!(error instanceof Error)) return typeof error;
  const details: string[] = [];
  const status = statusOf(error);
  if (status) details.push(`status ${status}`);
  const { code, finishReason } = error as { code?: unknown; finishReason?: unknown };
  if (typeof code === "string" && /^[\w.-]{1,40}$/.test(code)) details.push(`code ${code}`);
  if (typeof finishReason === "string" && /^[\w-]{1,40}$/.test(finishReason)) details.push(`finish ${finishReason}`);
  return `${error.name}${details.length ? ` (${details.join(", ")})` : ""}`;
}

/** The one-line log entry for a route error; `label` is the route or a short description of the call. */
export function formatRouteError(label: string, error: unknown, status?: number): string {
  return `[${label}]${status ? ` ${status}` : ""} ${describeError(error)}`;
}

/** Logs a route error on the server console (see `formatRouteError`). */
export function logRouteError(label: string, error: unknown, status?: number): void {
  console.error(formatRouteError(label, error, status));
}
