import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { Settings } from "@/lib/settings";
import {
  buildExerciseInstructions,
  buildExercisePrompt,
  type ExerciseRequest,
  exercisesSchema,
  MIN_EXERCISES,
  normalizeExercises,
} from "./exercises-core";
import { withFallback } from "./providers";

/** Generates a set of tense exercises. Too few usable items counts as a failure, so the next model is tried. */
export async function generateExercises(request: Omit<ExerciseRequest, "explanationLanguage">, settings: Settings) {
  const input = { ...request, explanationLanguage: settings.explanationLanguage };

  const { result, used } = await withFallback(settings, async (resolved, { isLast }) => {
    const run = async () => {
      const { output } = await generateText({
        ...resolved.call({ temperature: 0.7, retry: isLast }),
        instructions: buildExerciseInstructions(input),
        prompt: buildExercisePrompt(input),
        output: Output.object({ schema: exercisesSchema }),
      });
      const items = normalizeExercises(output, input);
      if (items.length < MIN_EXERCISES) throw new Error("The model didn't return enough usable exercises");
      return items;
    };
    try {
      return await run();
    } catch (error) {
      // Small local models occasionally produce invalid JSON: one retry usually fixes it.
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      return await run();
    }
  });

  return { items: result, provider: used.provider, modelId: used.modelId };
}
