import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { Settings } from "@/lib/settings";
import {
  type AnalysisPromptInput,
  analysisSchema,
  buildAnalysisInstructions,
  buildAnalysisPrompt,
  normalizeAnalysis,
} from "./analysis";
import { withFallback } from "./providers";

export async function analyzeMessage(input: Omit<AnalysisPromptInput, "explanationLanguage">, settings: Settings) {
  const promptInput = { ...input, explanationLanguage: settings.explanationLanguage };

  const { result, used, failed } = await withFallback(settings, async (resolved, { isLast }) => {
    const run = () =>
      generateText({
        ...resolved.call({ temperature: 0.2, retry: isLast }),
        instructions: buildAnalysisInstructions(promptInput),
        prompt: buildAnalysisPrompt(promptInput),
        output: Output.object({ schema: analysisSchema }),
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
    analysis: normalizeAnalysis(result.output, input.mode, input.text, input.inputMode),
    provider: used.provider,
    modelId: used.modelId,
    fallbackAttempts: failed,
  };
}
