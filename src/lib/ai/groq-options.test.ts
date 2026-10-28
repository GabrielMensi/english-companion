import { describe, expect, it } from "vitest";
import { groqReasoningEffort } from "./groq-options";

describe("groqReasoningEffort", () => {
  it("turns reasoning off for Qwen3", () => {
    expect(groqReasoningEffort("qwen/qwen3.8-27b")).toBe("none");
    expect(groqReasoningEffort("qwen3-32b")).toBe("none");
  });

  it("keeps it minimal where it can't be turned off", () => {
    expect(groqReasoningEffort("openai/gpt-oss-120b")).toBe("low");
  });

  it("leaves other models alone", () => {
    expect(groqReasoningEffort("llama-3.3-70b-versatile")).toBeUndefined();
  });
});
