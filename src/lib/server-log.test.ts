import { describe, expect, it } from "vitest";
import { formatRouteError, scrub } from "./server-log";

describe("scrub", () => {
  it("hides API keys and auth headers", () => {
    const text = [
      "Authorization: Bearer abc123def456",
      "x-goog-api-key: AIzaSyA1234567890abcdefghijklmnop",
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
  it("writes route, status, name and a scrubbed message", () => {
    const error = new TypeError("failed with key=SECRET123");
    expect(formatRouteError("POST /api/practice", error, 502)).toBe(
      "[POST /api/practice] 502 TypeError: failed with key=[redacted]",
    );
  });

  it("handles non-Error values", () => {
    expect(formatRouteError("GET /api/x", "boom", 500)).toBe("[GET /api/x] 500 string: boom");
  });
});
