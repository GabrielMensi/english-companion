import "server-only";

import { generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import type { Settings } from "@/lib/settings";
import {
  type Analysis,
  type AnalysisPreview,
  type AnalysisPromptInput,
  analysisSchema,
  buildAnalysisInstructions,
  buildAnalysisPrompt,
  normalizeAnalysis,
  type PartialAnalysis,
  previewAnalysis,
} from "./analysis";
import { canRetryWithoutStreaming } from "./fallback";
import { type ResolvedModel, withFallback } from "./providers";

/**
 * Receives the analysis while it's generated. `null` means "start over": the model failed
 * mid-stream and another attempt (same model without streaming, or the next fallback) is running.
 */
export type OnPreview = (preview: AnalysisPreview | null) => void;

function analysisRequest(input: AnalysisPromptInput, resolved: ResolvedModel, isLast: boolean) {
  return {
    ...resolved.call({ temperature: 0.2, retry: isLast }),
    instructions: buildAnalysisInstructions(input),
    prompt: buildAnalysisPrompt(input),
    output: Output.object({ schema: analysisSchema }),
  };
}

/**
 * Analyzes a message. With `onPreview`, the analysis is streamed and reported as it's generated;
 * the returned result is the same either way (the complete, validated object, normalized).
 */
export async function analyzeMessage(
  input: Omit<AnalysisPromptInput, "explanationLanguage">,
  settings: Settings,
  onPreview?: OnPreview,
) {
  const promptInput = { ...input, explanationLanguage: settings.explanationLanguage };

  const { result, used, failed } = await withFallback(settings, async (resolved, { isLast }) => {
    const request = analysisRequest(promptInput, resolved, isLast);
    const generate = async () => (await generateText(request)).output;

    if (onPreview) {
      try {
        return await streamAnalysis(request, (partial) =>
          onPreview(previewAnalysis(partial, input.mode, input.text, input.inputMode)),
        );
      } catch (error) {
        onPreview(null);
        if (!canRetryWithoutStreaming(error)) throw error;
        // Invalid JSON gets its single retry here; any other streaming problem, the regular path.
        if (NoObjectGeneratedError.isInstance(error)) return await generate();
      }
    }

    try {
      return await generate();
    } catch (error) {
      // Small local models occasionally produce invalid JSON: one retry usually fixes it.
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      return await generate();
    }
  });

  return {
    analysis: normalizeAnalysis(result, input.mode, input.text, input.inputMode),
    provider: used.provider,
    modelId: used.modelId,
    fallbackAttempts: failed,
  };
}

/**
 * The same request as `generateText`, streamed: reports each partial object and resolves with the
 * complete, schema-validated one, so the saved result doesn't depend on streaming.
 */
async function streamAnalysis(
  request: ReturnType<typeof analysisRequest>,
  onPartial: (partial: PartialAnalysis) => void,
): Promise<Analysis> {
  // Errors don't throw while streaming: the stream just ends and `output` rejects with a generic
  // "no output" error. Keep the real one so the fallback note and the error message stay meaningful.
  let streamError: unknown;
  const result = streamText({
    ...request,
    onError: ({ error }) => {
      streamError ??= error;
    },
  });
  for await (const partial of result.partialOutputStream) onPartial(partial);
  try {
    return await result.output;
  } catch (error) {
    throw streamError ?? error;
  }
}
