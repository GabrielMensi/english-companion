import "server-only";

import { db, schema } from "@/db";
import { generateExercises } from "@/lib/ai/exercises";
import { createSession, updateSession } from "@/lib/chat";
import { withChatPriority } from "@/lib/classification";
import { type Practice, savePractice } from "@/lib/practice";
import { getSettings } from "@/lib/settings";
import { getDashboardData } from "@/lib/stats";
import type { Tense } from "@/lib/taxonomy";
import {
  type ExerciseKind,
  exerciseOpening,
  pickQuestion,
  practiceTitle,
  selectPracticeTargets,
} from "@/lib/tense-practice";

/** Long enough for the tense stats to mean something, recent enough to reflect the current level. */
const TARGETS_RANGE = "90";

/** Tenses worth practicing now, from the per-tense diagnosis of the last 90 days. */
export function getPracticeTargets() {
  return selectPracticeTargets(getDashboardData(TARGETS_RANGE).tenses.tenses);
}

export interface StartPracticeInput {
  kind: ExerciseKind | "conversation";
  tense: Tense;
  contrastWith: Tense | null;
}

/**
 * Creates a practice chat and its opening message: a question that needs the
 * tense (conversation mode), or the first of a set of generated exercises
 * (correction mode, where the next item comes as the reply to each answer).
 * The learner's answers go through the normal correction pipeline.
 */
export async function startPractice(input: StartPracticeInput) {
  let practice: Practice;
  let opening: string;
  let origin: { provider: string | null; model: string | null } = { provider: null, model: null };

  if (input.kind === "conversation") {
    practice = { kind: "conversation", tense: input.tense };
    opening = pickQuestion(input.tense);
  } else {
    const contrastWith = input.kind === "contrast" && input.contrastWith !== input.tense ? input.contrastWith : null;
    const generated = await withChatPriority(() =>
      generateExercises({ kind: input.kind as ExerciseKind, tense: input.tense, contrastWith }, getSettings()),
    );
    practice = { kind: input.kind, tense: input.tense, contrastWith, items: generated.items };
    opening = exerciseOpening(practice);
    origin = { provider: generated.provider, model: generated.modelId };
  }

  const session = createSession(practice.kind === "conversation" ? "conversation" : "correction");
  savePractice(session.id, practice);
  db.insert(schema.messages)
    .values({ id: crypto.randomUUID(), sessionId: session.id, role: "assistant", content: opening, ...origin })
    .run();
  return updateSession(session.id, {
    title: practiceTitle({ ...practice, contrastWith: "contrastWith" in practice ? practice.contrastWith : null }),
  });
}
