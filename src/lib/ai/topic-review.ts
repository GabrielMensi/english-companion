import "server-only";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "@/lib/zod";
import type { Settings } from "@/lib/settings";
import {
  buildFeedbackInstructions,
  buildFeedbackPrompt,
  buildPhrasesInstructions,
  buildPhrasesPrompt,
  feedbackSchema,
  normalizeFeedback,
  normalizePhrases,
  type PhraseSource,
  phrasesSchema,
  type ReviewTurn,
} from "@/lib/topic-review-core";
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

/** Reviews a topic conversation from the learner's real messages and stored corrections. */
export async function generateFeedback(
  userId: string,
  topic: string,
  turns: readonly ReviewTurn[],
  settings: Settings,
) {
  const { output, provider, modelId } = await generateObject(userId, settings, {
    instructions: buildFeedbackInstructions(topic, settings.explanationLanguage),
    prompt: buildFeedbackPrompt(topic, turns),
    schema: feedbackSchema,
    temperature: 0.2,
  });
  return { feedback: normalizeFeedback(output, turns), provider, modelId };
}

/** Picks reusable expressions from the chat's texts; only phrases found in them survive. */
export async function suggestPhrases(
  userId: string,
  topic: string,
  sources: readonly PhraseSource[],
  alreadySaved: ReadonlySet<string>,
  settings: Settings,
) {
  const { output } = await generateObject(userId, settings, {
    instructions: buildPhrasesInstructions(topic),
    prompt: buildPhrasesPrompt(sources),
    schema: phrasesSchema,
    temperature: 0.2,
  });
  return normalizePhrases(output, sources, alreadySaved);
}
