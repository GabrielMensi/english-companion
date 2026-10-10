import { describe, expect, it } from "vitest";
import { modelIdSchema, savedModels } from "./model-id";

describe("modelIdSchema", () => {
  it("accepts the ids providers use", () => {
    for (const id of [
      "qwen/qwen3.8-27b",
      "gemini-flash-lite-latest",
      "openai/gpt-oss-120b",
      "tunedModels/my-model:v2",
    ]) {
      expect(modelIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects path traversal, spaces and query characters", () => {
    for (const id of ["../x", "models/../files", "a b", "a?b", "", "x".repeat(121)]) {
      expect(modelIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("savedModels", () => {
  const defaults = { gemini: "gemini-flash-latest", groq: "openai/gpt-oss-120b" };

  it("keeps valid saved models", () => {
    expect(savedModels(defaults, { gemini: "gemini-2.5-pro", groq: "qwen/qwen3.8-27b" })).toEqual({
      gemini: "gemini-2.5-pro",
      groq: "qwen/qwen3.8-27b",
    });
  });

  it("falls back to the default only for the invalid or missing one, and drops unknown providers", () => {
    expect(savedModels(defaults, { gemini: "../x", ollama: "gemma4:12b" })).toEqual(defaults);
    expect(savedModels(defaults, { groq: "qwen/qwen3.8-27b" })).toEqual({ ...defaults, groq: "qwen/qwen3.8-27b" });
    expect(savedModels(defaults, undefined)).toEqual(defaults);
  });
});
