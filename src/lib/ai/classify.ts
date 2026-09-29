import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { Settings } from "@/lib/settings";
import {
  buildClassificationInstructions,
  buildClassificationPrompt,
  type ClassificationItem,
  classificationSchema,
  normalizeClassification,
} from "./classify-core";
import { withFallback } from "./providers";

/** Classifies a batch of mistakes in one request. Items the model skipped are missing from the result. */
export async function classifyBatch(items: ClassificationItem[], settings: Settings) {
  const { result, used } = await withFallback(settings, async (resolved, { isLast }) => {
    const run = () =>
      generateText({
        ...resolved.call({ temperature: 0, retry: isLast }),
        instructions: buildClassificationInstructions(),
        prompt: buildClassificationPrompt(items),
        output: Output.object({ schema: classificationSchema }),
      });
    try {
      return await run();
    } catch (error) {
      // Small local models occasionally produce invalid JSON: one retry usually fixes it.
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      return await run();
    }
  });

  return {
    results: normalizeClassification(items, result.output),
    classifiedBy: `${used.provider}:${used.modelId}`,
  };
}
