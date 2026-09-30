import { describe, expect, it } from "vitest";
import { AllModelsFailedError, errorToMessage, fallbackOrder, runWithFallback, shortReason } from "./fallback";

describe("fallbackOrder", () => {
  const all = () => true;

  it("puts the selected provider first and skips it among the fallbacks", () => {
    expect(fallbackOrder("gemini", ["ollama", "gemini", "groq"], all)).toEqual(["gemini", "groq", "ollama"]);
  });

  it("tries remote fallbacks before the local model, whatever the saved order", () => {
    expect(fallbackOrder("groq", ["ollama", "gemini"], all)).toEqual(["groq", "gemini", "ollama"]);
    expect(fallbackOrder("ollama", ["groq", "gemini"], all)).toEqual(["ollama", "groq", "gemini"]);
  });

  it("skips fallbacks that are not configured or not enabled", () => {
    expect(fallbackOrder("gemini", ["ollama", "groq"], (p) => p !== "groq")).toEqual(["gemini", "ollama"]);
    expect(fallbackOrder("ollama", [], all)).toEqual(["ollama"]);
  });
});

describe("runWithFallback", () => {
  const candidates = [
    { provider: "gemini" as const, modelId: "gemini-flash-latest" },
    { provider: "ollama" as const, modelId: "qwen2.5:14b-instruct" },
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
    expect(used.provider).toBe("ollama");
    expect(failed).toEqual([{ provider: "gemini", model: "gemini-flash-latest", reason: "quota exceeded" }]);
    expect(seen).toEqual([
      { provider: "gemini", isLast: false },
      { provider: "ollama", isLast: false },
    ]);
  });

  it("does not try fallbacks when the first model works", async () => {
    const { used, failed } = await runWithFallback(candidates, async () => 1);
    expect(used.provider).toBe("gemini");
    expect(failed).toEqual([]);
  });

  it("throws with every attempt when all models fail", async () => {
    const error = await runWithFallback(candidates, async (c) => {
      throw new Error(c.provider === "ollama" ? "fetch failed" : "This model is currently experiencing high demand");
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AllModelsFailedError);
    expect(error.attempts.map((a: { reason: string }) => a.reason)).toEqual(["overloaded", "unreachable", "overloaded"]);
    expect(errorToMessage(error)).toMatch(/^All models failed: gemini-flash-latest \(overloaded\), .*overloaded right now/);
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
});
