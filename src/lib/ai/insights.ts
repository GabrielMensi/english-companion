import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "@/lib/zod";
import type { StatsDigest } from "@/lib/insights/digest-core";
import type { LevelEstimate, LevelWindow } from "@/lib/insights/level-core";
import {
  buildLevelInstructions,
  buildLevelPrompt,
  buildPlanInstructions,
  buildPlanPrompt,
  levelExplanationSchema,
  normalizeLevelExplanation,
  normalizePlan,
  studyPlanSchema,
} from "@/lib/insights/plan-core";
import type { Settings } from "@/lib/settings";
import { withFallback } from "./providers";

async function generateObject<S extends z.ZodType>(
  userId: string,
  settings: Settings,
  options: { instructions: string; prompt: string; schema: S; temperature: number },
) {
  const { result, used } = await withFallback(userId, settings, async (resolved, { isLast }) => {
    const run = () =>
      generateText({
        ...resolved.call({ temperature: options.temperature, retry: isLast }),
        instructions: options.instructions,
        prompt: options.prompt,
        output: Output.object({ schema: options.schema }),
      });
    try {
      return await run();
    } catch (error) {
      // Models occasionally produce invalid JSON: one retry usually fixes it.
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      return await run();
    }
  });
  return { output: result.output as z.infer<S>, provider: used.provider, modelId: used.modelId };
}

/** Writes a study plan for the next week from the period's digest. */
export async function generateStudyPlan(userId: string, digest: StatsDigest, settings: Settings) {
  const { output, provider, modelId } = await generateObject(userId, settings, {
    instructions: buildPlanInstructions(settings.explanationLanguage),
    prompt: buildPlanPrompt(digest),
    schema: studyPlanSchema,
    temperature: 0.4,
  });
  return { plan: normalizePlan(output), provider, modelId };
}

/** Explains the rule-based level estimate in plain words. It never changes the level. */
export async function explainLevel(
  userId: string,
  estimate: LevelEstimate,
  evolution: LevelWindow[],
  settings: Settings,
) {
  const { output, provider, modelId } = await generateObject(userId, settings, {
    instructions: buildLevelInstructions(settings.explanationLanguage),
    prompt: buildLevelPrompt(estimate, evolution),
    schema: levelExplanationSchema,
    temperature: 0.3,
  });
  return { explanation: normalizeLevelExplanation(output), provider, modelId };
}
