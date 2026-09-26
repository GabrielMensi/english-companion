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
import { resolveModel } from "./providers";

export async function analyzeMessage(input: Omit<AnalysisPromptInput, "explanationLanguage">, settings: Settings) {
  const resolved = resolveModel(settings);
  const promptInput = { ...input, explanationLanguage: settings.explanationLanguage };

  const run = () =>
    generateText({
      ...resolved.call({ temperature: 0.2 }),
      instructions: buildAnalysisInstructions(promptInput),
      prompt: buildAnalysisPrompt(promptInput),
      output: Output.object({ schema: analysisSchema }),
    });

  let result;
  try {
    result = await run();
  } catch (error) {
    // Small local models occasionally produce invalid JSON: one retry usually fixes it.
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    result = await run();
  }

  return {
    analysis: normalizeAnalysis(result.output, input.mode, input.text),
    provider: resolved.provider,
    modelId: resolved.modelId,
  };
}
