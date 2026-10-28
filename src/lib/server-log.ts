/**
 * Minimal server log for route errors (no dependency, no server-only imports, unit tested). It only
 * writes the route, the error name, a scrubbed message and the status: never API keys, auth headers
 * or learner text (messages, corrections), which provider errors can echo back.
 */

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

/** The one-line log entry for a route error. */
export function formatRouteError(route: string, error: unknown, status: number): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = scrub(error instanceof Error ? error.message : String(error));
  return `[${route}] ${status} ${name}: ${message}`;
}

/** Logs a route error on the server console (see `formatRouteError`). */
export function logRouteError(route: string, error: unknown, status: number): void {
  console.error(formatRouteError(route, error, status));
}
