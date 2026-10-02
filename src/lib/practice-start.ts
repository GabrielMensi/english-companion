import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateCategoryExercises, generateExercises } from "@/lib/ai/exercises";
import {
  categoryExerciseOpening,
  categoryPracticeTitle,
  selectCategoryTargets,
  validSubtype,
} from "@/lib/category-practice";
import { createSession, updateSession } from "@/lib/chat";
import { withChatPriority } from "@/lib/classification";
import { type Practice, savePractice } from "@/lib/practice";
import { getSettings } from "@/lib/settings";
import { getDashboardData } from "@/lib/stats";
import { countsInStats, type ErrorCategory, type Tense } from "@/lib/taxonomy";
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

/** Both kinds of suggestions from a single pass over the stats: tenses, and the weakest error categories. */
export function getPracticeSuggestions() {
  const data = getDashboardData(TARGETS_RANGE);
  return { tenses: selectPracticeTargets(data.tenses.tenses), categories: selectCategoryTargets(data.stats) };
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
  let practice: Exclude<Practice, { kind: "category" }>;
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

export interface StartCategoryPracticeInput {
  category: ErrorCategory;
  subtype: string | null;
}

/** How many of the learner's own mistakes go into the prompt, as material. */
const MATERIAL_MISTAKES = 6;

/** The learner's latest distinct mistakes in the category (and type), the ones that count in the stats. */
function recentMistakes(category: ErrorCategory, subtype: string | null) {
  const { countTyposInStats } = getSettings();
  const rows = db
    .select({
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      severity: schema.corrections.severity,
      category: schema.corrections.category,
      inputMode: schema.messages.inputMode,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.corrections.messageId))
    .where(
      and(
        eq(schema.corrections.category, category),
        subtype ? eq(schema.corrections.subtype, subtype) : undefined,
      ),
    )
    .orderBy(desc(schema.corrections.createdAt))
    .limit(50)
    .all();
  const seen = new Set<string>();
  return rows
    .filter((r) => countsInStats(r, countTyposInStats) && r.original.trim() && r.original !== r.correction)
    .filter((r) => {
      const key = `${r.original} → ${r.correction}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MATERIAL_MISTAKES)
    .map(({ original, correction }) => ({ original, correction }));
}

/**
 * Creates an exercise chat for an error category: fill in the gap, multiple
 * choice and fix the mistake, using the learner's own mistakes as material.
 * Works like the tense exercise chats: correction mode, fixed feedback replies.
 */
export async function startCategoryPractice(input: StartCategoryPracticeInput) {
  const subtype = validSubtype(input.category, input.subtype);
  const generated = await withChatPriority(() =>
    generateCategoryExercises(
      { category: input.category, subtype, mistakes: recentMistakes(input.category, subtype) },
      getSettings(),
    ),
  );
  const practice: Practice = { kind: "category", category: input.category, subtype, items: generated.items };

  const session = createSession("correction");
  savePractice(session.id, practice);
  db.insert(schema.messages)
    .values({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "assistant",
      content: categoryExerciseOpening(practice),
      provider: generated.provider,
      model: generated.modelId,
    })
    .run();
  return updateSession(session.id, { title: categoryPracticeTitle(practice) });
}
