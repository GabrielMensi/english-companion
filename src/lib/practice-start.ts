import "server-only";

import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { generateCategoryExercises, generateExercises } from "@/lib/ai/exercises";
import {
  categoryExerciseIntro,
  categoryPracticeTitle,
  selectCategoryTargets,
  validSubtype,
} from "@/lib/category-practice";
import { createSession, updateSession } from "@/lib/chat";
import { withChatPriority } from "@/lib/classification";
import { setOpening } from "@/lib/exercise-set";
import { type Practice, savePractice } from "@/lib/practice";
import { getSettings } from "@/lib/settings";
import { getDashboardData } from "@/lib/stats";
import { countsInStats, type ErrorCategory, type Tense } from "@/lib/taxonomy";
import {
  type ExerciseKind,
  exerciseIntro,
  exerciseOpening,
  pickQuestion,
  practiceTitle,
  selectPracticeTargets,
} from "@/lib/tense-practice";
import { type TopicChoice, topicOpening, topicTitle } from "@/lib/topics";

/** Long enough for the tense stats to mean something, recent enough to reflect the current level. */
const TARGETS_RANGE = "90";

/** Both kinds of suggestions from a single pass over the stats: tenses, and the weakest error categories. */
export function getPracticeSuggestions(userId: string) {
  const data = getDashboardData(userId, TARGETS_RANGE);
  return { tenses: selectPracticeTargets(data.tenses.tenses), categories: selectCategoryTargets(data.stats) };
}

export interface StartPracticeInput {
  kind: ExerciseKind | "conversation";
  tense: Tense;
  contrastWith: Tense | null;
}

/**
 * Creates a practice chat and its opening message: a question that needs the
 * tense (conversation mode), or a set of generated exercises (correction mode):
 * contrast and form drills show the whole set, answered in one message; "use
 * it" tasks come one at a time, the next one as the reply to each answer. The
 * learner's answers go through the normal correction pipeline.
 */
export async function startPractice(userId: string, input: StartPracticeInput) {
  let practice: Exclude<Practice, { kind: "category" | "topic" }>;
  let opening: string;
  let origin: { provider: string | null; model: string | null } = { provider: null, model: null };

  if (input.kind === "conversation") {
    practice = { kind: "conversation", tense: input.tense };
    opening = pickQuestion(input.tense);
  } else {
    const contrastWith = input.kind === "contrast" && input.contrastWith !== input.tense ? input.contrastWith : null;
    const generated = await withChatPriority(userId, () =>
      generateExercises({ kind: input.kind as ExerciseKind, tense: input.tense, contrastWith }, getSettings(userId)),
    );
    practice = { kind: input.kind, tense: input.tense, contrastWith, items: generated.items };
    // "Use it" tasks go one at a time; the drills show the whole set, answered in one message.
    opening = input.kind === "use" ? exerciseOpening(practice) : setOpening(exerciseIntro(practice), practice.items);
    origin = { provider: generated.provider, model: generated.modelId };
  }

  const session = createSession(userId, practice.kind === "conversation" ? "conversation" : "correction");
  savePractice(userId, session.id, practice);
  db.insert(schema.messages)
    .values({ id: crypto.randomUUID(), userId, sessionId: session.id, role: "assistant", content: opening, ...origin })
    .run();
  return updateSession(userId, session.id, {
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
function recentMistakes(userId: string, category: ErrorCategory, subtype: string | null) {
  const { countTyposInStats } = getSettings(userId);
  const rows = db
    .select({
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      severity: schema.corrections.severity,
      category: schema.corrections.category,
      inputMode: schema.messages.inputMode,
      discardedAt: schema.corrections.discardedAt,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.corrections.messageId))
    .where(
      owned(
        schema.corrections,
        userId,
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
 * The whole set is shown at once and answered in one message, like the tense drills.
 */
export async function startCategoryPractice(userId: string, input: StartCategoryPracticeInput) {
  const subtype = validSubtype(input.category, input.subtype);
  const generated = await withChatPriority(userId, () =>
    generateCategoryExercises(
      { category: input.category, subtype, mistakes: recentMistakes(userId, input.category, subtype) },
      getSettings(userId),
    ),
  );
  const practice: Practice = { kind: "category", category: input.category, subtype, items: generated.items };

  const session = createSession(userId, "correction");
  savePractice(userId, session.id, practice);
  db.insert(schema.messages)
    .values({
      id: crypto.randomUUID(),
      userId,
      sessionId: session.id,
      role: "assistant",
      content: setOpening(categoryExerciseIntro(practice), practice.items),
      provider: generated.provider,
      model: generated.modelId,
    })
    .run();
  return updateSession(userId, session.id, { title: categoryPracticeTitle(practice) });
}

/**
 * Creates a conversation about a topic (src/lib/topics.ts) with a fixed
 * opening question, so it starts instantly. The topic steers the replies; the
 * learner's messages are corrected and counted like in any other chat.
 */
export function startTopicChat(userId: string, choice: TopicChoice) {
  const session = createSession(userId, "conversation");
  savePractice(userId, session.id, { kind: "topic", ...choice });
  db.insert(schema.messages)
    .values({
      id: crypto.randomUUID(),
      userId,
      sessionId: session.id,
      role: "assistant",
      content: topicOpening(choice),
    })
    .run();
  return updateSession(userId, session.id, { title: topicTitle(choice) });
}
