/**
 * Per-model settings for Groq calls. Reasoning ("thinking") tokens count against the free tier's
 * per-minute token limit and can cut a long correction off before the JSON is complete, so they're
 * turned off or minimized wherever the model accepts it.
 */

/** Enough for the correction JSON of a long, error-heavy message. */
export const MAX_OUTPUT_TOKENS = 4096;

/** The `reasoningEffort` the model accepts, or undefined to leave the model's default (non-reasoning models). */
export function groqReasoningEffort(modelId: string): "none" | "low" | undefined {
  const id = modelId.toLowerCase();
  if (id.includes("gpt-oss")) return "low"; // always reasons: "none" is rejected
  if (id.includes("qwen3") || id.includes("qwen/qwen3")) return "none";
  return undefined;
}
