import "server-only";

import {
  buildClassImportInstructions,
  buildClassImportPrompt,
  buildClassQuestionsInstructions,
  classImportSchema,
  classQuestionsSchema,
  normalizeClassImport,
  normalizeClassQuestions,
} from "@/lib/class-core";
import { withChatPriority } from "@/lib/classification";
import type { StatsDigest } from "@/lib/insights/digest-core";
import { digestToPromptText } from "@/lib/insights/digest-core";
import type { Settings } from "@/lib/settings";

import { generateObject } from "./insights";

/** Structures the learner's notes of the teacher's corrections with the fixed taxonomy. Nothing is saved here. */
export async function structureClassNotes(userId: string, text: string, settings: Settings) {
  const { output, provider, modelId } = await withChatPriority(userId, () =>
    generateObject(userId, settings, {
      instructions: buildClassImportInstructions(settings.explanationLanguage),
      prompt: buildClassImportPrompt(text),
      schema: classImportSchema,
      temperature: 0.1,
    }),
  );
  return { items: normalizeClassImport(output), provider, modelId };
}

/** What to ask the teacher, from the stats of the period. */
export async function generateClassQuestions(userId: string, digest: StatsDigest, settings: Settings) {
  const { output, provider, modelId } = await withChatPriority(userId, () =>
    generateObject(userId, settings, {
      instructions: buildClassQuestionsInstructions(settings.explanationLanguage),
      prompt: `Statistics since the last class:\n<<<\n${digestToPromptText(digest)}\n>>>`,
      schema: classQuestionsSchema,
      temperature: 0.4,
    }),
  );
  return { ...normalizeClassQuestions(output), provider, modelId };
}
