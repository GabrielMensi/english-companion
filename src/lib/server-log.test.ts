import { APICallError, JSONParseError, NoObjectGeneratedError, RetryError, TypeValidationError } from "ai";
import { describe, expect, it } from "vitest";
import { AllModelsFailedError } from "@/lib/ai/fallback";
import { formatRouteError, scrub } from "./server-log";

describe("scrub", () => {
  it("hides API keys and auth headers", () => {
    const text = [
      "Authorization: Bearer abc123def456",
      "x-goog-api-key: AIzaSyA1234567890abcdefghijklmnop", // gitleaks:allow (fake key)
      "url https://x.test/v1?key=SECRET123&alt=sse",
      "token gsk_abcdefghijklmnopqrstuv",
      "sk-proj-abcdefghijklmnopqrstuvwx",
    ].join(" ");
    const out = scrub(text);
    for (const secret of ["abc123def456", "AIzaSy", "SECRET123", "gsk_abc", "sk-proj"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("hides long quoted text (learner messages, corrections)", () => {
    const out = scrub('Bad request: "I goed to the store yesterday and buyed some bread" was rejected');
    expect(out).not.toContain("goed");
    expect(out).toContain("[text]");
  });

  it("keeps short useful messages and caps the length", () => {
    expect(scrub("HTTP 429: quota exceeded")).toBe("HTTP 429: quota exceeded");
    expect(scrub("x ".repeat(500)).length).toBeLessThanOrEqual(300);
  });
});

describe("formatRouteError", () => {
  it("keeps the scrubbed message of the app's own errors", () => {
    const error = new Error("failed with key=SECRET123");
    expect(formatRouteError("POST /api/practice", error, 502)).toBe(
      "[POST /api/practice] 502 Error: failed with key=[redacted]",
    );
  });

  it("never logs the message of provider and AI SDK errors", () => {
    const text = "I goed home";
    const errors = [
      new TypeValidationError({ value: { original: text }, cause: new Error(`Value: {"original":"${text}"}`) }),
      new JSONParseError({ text, cause: new Error("bad") }),
      new NoObjectGeneratedError({
        message: `No object: ${text}`,
        text,
        response: {} as never,
        usage: {} as never,
        finishReason: "length",
      }),
      new APICallError({
        message: `Bad ${text}`,
        url: "https://x.test",
        requestBodyValues: { text },
        statusCode: 400,
        responseBody: text,
      }),
      new TypeError(`Cannot read ${text}`),
    ];
    for (const error of errors) {
      const line = formatRouteError("POST /api/x", error, 502);
      expect(line).not.toContain("goed");
      expect(line).toContain(error.name);
    }
  });

  it("logs the HTTP status of a provider error, also after retries", () => {
    const call = new APICallError({ message: "x", url: "https://x.test", requestBodyValues: {}, statusCode: 429 });
    const retry = new RetryError({ message: "failed after retries", reason: "maxRetriesExceeded", errors: [call] });
    expect(formatRouteError("POST /api/x", retry, 502)).toBe("[POST /api/x] 502 AI_APICallError (status 429)");
    expect(formatRouteError("POST /api/x", new AllModelsFailedError([], retry), 502)).toBe(
      "[POST /api/x] 502 AI_APICallError (status 429)",
    );
  });

  it("handles non-Error values and a missing status", () => {
    expect(formatRouteError("GET /api/x", "boom")).toBe("[GET /api/x] string");
  });
});
