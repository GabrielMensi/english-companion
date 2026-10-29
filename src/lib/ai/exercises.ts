import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";

import type { Settings } from "@/lib/settings";
import type { z } from "@/lib/zod";

import {
  buildCategoryExerciseInstructions,
  buildCategoryExercisePrompt,
  buildExerciseInstructions,
  buildExercisePrompt,
  type CategoryExerciseRequest,
  categoryExercisesSchema,
  type ExerciseRequest,
  exercisesSchema,
  MIN_EXERCISES,
  normalizeCategoryExercises,
  normalizeExercises,
} from "./exercises-core";
import { withFallback } from "./providers";

/**
 * Generates a set of exercise items with a flat schema and keeps
 * the usable ones. Too few usable items counts as a failure, so the next model is tried.
 */
async function generateItems<Raw, T>(
  userId: string,
  settings: Settings,
  prompt: { instructions: string; prompt: string; schema: z.ZodType<Raw> },
  normalize: (raw: Raw) => T[],
) {
  const { result, used } = await withFallback(userId, settings, async (resolved, { isLast }) => {
    const run = async () => {
      const { output } = await generateText({
        ...resolved.call({ temperature: 0.7, retry: isLast }),
        instructions: prompt.instructions,
        prompt: prompt.prompt,
        output: Output.object({ schema: prompt.schema }),
      });
      const items = normalize(output);
      if (items.length < MIN_EXERCISES) throw new Error("The model didn't return enough usable exercises");
      return items;
    };
    try {
      return await run();
    } catch (error) {
      // Models occasionally produce invalid JSON: one retry usually fixes it.
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      return await run();
    }
  });

  return { items: result, provider: used.provider, modelId: used.modelId };
}

/** Generates a set of tense exercises. */
export async function generateExercises(
  userId: string,
  request: Omit<ExerciseRequest, "explanationLanguage">,
  settings: Settings,
) {
  const input = { ...request, explanationLanguage: settings.explanationLanguage };
  return generateItems(
    userId,
    settings,
    { instructions: buildExerciseInstructions(input), prompt: buildExercisePrompt(input), schema: exercisesSchema },
    (raw) => normalizeExercises(raw, input),
  );
}

/** Generates a set of exercises (fill in, multiple choice, fix the mistake) for an error category. */
export async function generateCategoryExercises(
  userId: string,
  request: Omit<CategoryExerciseRequest, "explanationLanguage">,
  settings: Settings,
) {
  const input = { ...request, explanationLanguage: settings.explanationLanguage };
  return generateItems(
    userId,
    settings,
    {
      instructions: buildCategoryExerciseInstructions(input),
      prompt: buildCategoryExercisePrompt(input),
      schema: categoryExercisesSchema,
    },
    (raw) => normalizeCategoryExercises(raw, input),
  );
}
