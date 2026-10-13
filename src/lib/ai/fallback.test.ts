import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import {
  AllModelsFailedError,
  canRetryWithoutStreaming,
  chainSteps,
  errorToMessage,
  fallbackOrder,
  moveStep,
  runWithFallback,
  setPrimary,
  shortReason,
  toggleStep,
  upgradeChain,
  UserFacingError,
} from "./fallback";

describe("fallbackOrder", () => {
  const all = () => true;

  it("puts the selected provider first and skips it among the fallbacks", () => {
    expect(fallbackOrder("gemini", ["gemini", "groq"], all)).toEqual(["gemini", "groq"]);
  });

  it("keeps the saved order", () => {
    expect(fallbackOrder("groq", ["gemini"], all)).toEqual(["groq", "gemini"]);
  });

  it("skips fallbacks that are not configured or not enabled", () => {
    expect(fallbackOrder("gemini", ["groq"], (p) => p !== "groq")).toEqual(["gemini"]);
    expect(fallbackOrder("groq", [], all)).toEqual(["groq"]);
  });
});

describe("upgradeChain", () => {
  it("drops providers that no longer exist", () => {
    expect(upgradeChain({ provider: "gemini", fallbacks: ["ollama", "gemini", "groq"] }, "gemini")).toEqual({
      provider: "gemini",
      fallbacks: ["groq"],
    });
  });

  it("promotes the first remaining fallback when the primary is gone", () => {
    expect(upgradeChain({ provider: "ollama", fallbacks: ["groq", "gemini"] }, "gemini")).toEqual({
      provider: "groq",
      fallbacks: ["gemini"],
    });
    expect(upgradeChain({ provider: "ollama", fallbacks: ["ollama"] }, "gemini")).toEqual({
      provider: "gemini",
      fallbacks: [],
    });
  });

  it("uses the default when nothing was saved", () => {
    expect(upgradeChain({}, "gemini")).toEqual({ provider: "gemini", fallbacks: [] });
  });
});

describe("chain editing", () => {
  const chain = { provider: "gemini" as const, fallbacks: ["groq" as const] };

  it("lists enabled steps in order, then the disabled ones", () => {
    expect(chainSteps(chain)).toEqual([
      { provider: "gemini", enabled: true },
      { provider: "groq", enabled: true },
    ]);
    expect(chainSteps({ provider: "groq", fallbacks: [] })).toEqual([
      { provider: "groq", enabled: true },
      { provider: "gemini", enabled: false },
    ]);
    // Old settings could list the primary among the fallbacks.
    expect(chainSteps({ provider: "groq", fallbacks: ["groq", "gemini"] }).map((s) => s.provider)).toEqual([
      "groq",
      "gemini",
    ]);
  });

  it("moves a step, making it the primary when it reaches the top", () => {
    expect(moveStep(chain, "groq", -1)).toEqual({ provider: "groq", fallbacks: ["gemini"] });
    expect(moveStep(chain, "gemini", 1)).toEqual({ provider: "groq", fallbacks: ["gemini"] });
    expect(moveStep(chain, "gemini", -1)).toEqual(chain);
    expect(moveStep(chain, "groq", 1)).toEqual(chain);
    expect(moveStep({ provider: "gemini", fallbacks: [] }, "groq", -1)).toEqual({ provider: "gemini", fallbacks: [] });
  });

  it("toggles fallbacks but never the primary", () => {
    expect(toggleStep({ provider: "gemini", fallbacks: [] }, "groq", true)).toEqual(chain);
    expect(toggleStep(chain, "groq", false)).toEqual({ provider: "gemini", fallbacks: [] });
    expect(toggleStep(chain, "gemini", false)).toEqual(chain);
  });

  it("keeps the previous primary as the first fallback when switching", () => {
    expect(setPrimary(chain, "groq")).toEqual({ provider: "groq", fallbacks: ["gemini"] });
    expect(setPrimary({ provider: "gemini", fallbacks: [] }, "groq")).toEqual({
      provider: "groq",
      fallbacks: ["gemini"],
    });
    expect(setPrimary(chain, "gemini")).toEqual(chain);
  });
});

describe("runWithFallback", () => {
  const candidates = [
    { provider: "gemini" as const, modelId: "gemini-flash-latest" },
    { provider: "groq" as const, modelId: "qwen/qwen3.8-27b" },
    { provider: "groq" as const, modelId: "openai/gpt-oss-120b" },
  ];

  it("returns the first success and the attempts that failed before it", async () => {
    const seen: { provider: string; isLast: boolean }[] = [];
    const { result, used, failed } = await runWithFallback(candidates, async (c, { isLast }) => {
      seen.push({ provider: c.provider, isLast });
      if (c.provider === "gemini") throw new Error("You exceeded your current quota");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(used.modelId).toBe("qwen/qwen3.8-27b");
    expect(failed).toEqual([{ provider: "gemini", model: "gemini-flash-latest", reason: "quota exceeded" }]);
    expect(seen).toEqual([
      { provider: "gemini", isLast: false },
      { provider: "groq", isLast: false },
    ]);
  });

  it("does not try fallbacks when the first model works", async () => {
    const { used, failed } = await runWithFallback(candidates, async () => 1);
    expect(used.provider).toBe("gemini");
    expect(failed).toEqual([]);
  });

  it("throws with every attempt when all models fail", async () => {
    const error = await runWithFallback(candidates, async (c) => {
      throw new Error(
        c.modelId === "qwen/qwen3.8-27b" ? "fetch failed" : "This model is currently experiencing high demand",
      );
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AllModelsFailedError);
    expect(error.attempts.map((a: { reason: string }) => a.reason)).toEqual([
      "overloaded",
      "unreachable",
      "overloaded",
    ]);
    expect(errorToMessage(error)).toMatch(
      /^All models failed: gemini-flash-latest \(overloaded\), .*overloaded right now/,
    );
  });

  it("keeps the plain message when only one model was tried", async () => {
    const error = await runWithFallback(candidates.slice(0, 1), async () => {
      throw new Error("fetch failed");
    }).catch((e) => e);
    expect(errorToMessage(error)).toMatch(/^Couldn't connect to the AI provider/);
  });
});

describe("shortReason", () => {
  it("summarizes common provider errors", () => {
    expect(shortReason(new Error("API key not valid. Please pass a valid API key."))).toBe("invalid API key");
    expect(shortReason(new Error("model 'foo' not found"))).toBe("model not found");
    expect(shortReason(new Error("The operation was aborted due to timeout"))).toBe("timed out");
    expect(shortReason(new Error("x".repeat(100)))).toHaveLength(78);
  });

  it("never repeats an unrecognized provider message", () => {
    expect(shortReason(providerError("Request 7f3a for projects/123 failed: internal detail", 400))).toBe(
      "provider error 400",
    );
    expect(shortReason(new TypeError("Cannot read properties of undefined"))).toBe("provider error");
  });
});

function providerError(message: string, statusCode: number) {
  return new APICallError({ message, url: "https://provider.example/v1/chat", requestBodyValues: {}, statusCode });
}

describe("errorToMessage", () => {
  it("hides the raw message of errors that don't come from the app", () => {
    const message = errorToMessage(providerError("Request 7f3a for projects/123 failed: internal detail", 400));
    expect(message).toBe("The AI provider returned an error (HTTP 400). Try again or switch providers.");
    expect(errorToMessage(new TypeError("Cannot read properties of undefined (reading 'x')"))).not.toMatch(/undefined/);
    expect(errorToMessage("a thrown string")).not.toMatch(/thrown string/);
  });

  it("keeps the HTTP status when the SDK gave up after retrying", () => {
    const error = new RetryError({
      message: "Failed after 3 attempts. Last error: internal detail",
      reason: "maxRetriesExceeded",
      errors: [providerError("first", 500), providerError("internal detail", 500)],
    });
    expect(errorToMessage(error)).toBe("The AI provider returned an error (HTTP 500). Try again or switch providers.");
    expect(shortReason(error)).toBe("provider error 500");
  });

  it("reports a key the SDK couldn't find", () => {
    const error = new LoadAPIKeyError({ message: "Google Generative AI API key is missing." });
    expect(errorToMessage(error)).toBe("The AI provider's API key is missing. Add it in Settings.");
    expect(shortReason(error)).toBe("missing API key");
  });

  it("keeps the app's own messages", () => {
    expect(errorToMessage(new Error("There are no messages in this period yet"))).toBe(
      "There are no messages in this period yet",
    );
    expect(errorToMessage(new UserFacingError("Dictation needs a Groq API key."))).toBe(
      "Dictation needs a Groq API key.",
    );
  });

  it("translates a rejected key and a missing model without the provider's wording", () => {
    expect(errorToMessage(providerError("API key not valid. Please pass a valid API key.", 400))).toMatch(
      /rejected the API key/,
    );
    expect(errorToMessage(providerError("models/foo is not found for API version v1beta", 404))).toBe(
      "The provider doesn't have that model. Check the model name in Settings.",
    );
  });
});

describe("canRetryWithoutStreaming", () => {
  it("retries invalid output and unknown streaming errors with the same model", () => {
    expect(canRetryWithoutStreaming(new NoObjectGeneratedError({ message: "bad json" } as never))).toBe(true);
    expect(canRetryWithoutStreaming(new Error("Streaming is not supported with response_format"))).toBe(true);
  });

  it("moves on when the model would fail the same way", () => {
    expect(canRetryWithoutStreaming(new Error("fetch failed"))).toBe(false);
    expect(canRetryWithoutStreaming(new Error("The operation was aborted due to timeout"))).toBe(false);
    expect(canRetryWithoutStreaming(new Error("429 RESOURCE_EXHAUSTED"))).toBe(false);
    expect(canRetryWithoutStreaming(new Error("model 'foo' not found"))).toBe(false);
  });
});
