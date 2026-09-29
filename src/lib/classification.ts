import "server-only";

import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { classifyBatch } from "@/lib/ai/classify";
import { type Classification, type ClassificationItem, ruleClassification } from "@/lib/ai/classify-core";
import { AllModelsFailedError, errorToMessage } from "@/lib/ai/fallback";
import { getSettings } from "@/lib/settings";
import { type ErrorCategory, isValidSubtype, type Tense, TENSE_CATEGORIES } from "@/lib/taxonomy";
import type { ChatCorrection } from "@/lib/types";

/**
 * Deferred fine classification of mistakes. The chat saves each mistake as
 * "pending"; this job classifies them in batches when the dashboard is opened,
 * when the app has been idle for a while, or on demand. Chat requests always
 * go first, so only one model call runs at a time and the chat stays fast.
 */

const BATCH_SIZE = 8;
const MAX_ATTEMPTS = 3;
const IDLE_MS = 5 * 60_000;

interface JobState {
  running: boolean;
  activeChats: number;
  lastError: string | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// Kept on globalThis so hot reloads in development don't lose it.
const globalForJob = globalThis as unknown as { __classification?: JobState };
const state = (globalForJob.__classification ??= {
  running: false,
  activeChats: 0,
  lastError: null,
  idleTimer: null,
});

export interface ClassificationStatus {
  pending: number;
  failed: number;
  running: boolean;
  lastError: string | null;
}

export function getClassificationStatus(): ClassificationStatus {
  const counts = db
    .select({ classification: schema.corrections.classification, n: count() })
    .from(schema.corrections)
    .groupBy(schema.corrections.classification)
    .all();
  const of = (status: string) => counts.find((c) => c.classification === status)?.n ?? 0;
  return { pending: of("pending"), failed: of("failed"), running: state.running, lastError: state.lastError };
}

/** Runs a chat request with priority: classification batches wait until it's done. */
export async function withChatPriority<T>(run: () => Promise<T>): Promise<T> {
  state.activeChats++;
  if (state.idleTimer) clearTimeout(state.idleTimer);
  try {
    return await run();
  } finally {
    state.activeChats--;
    scheduleIdleClassification();
  }
}

function scheduleIdleClassification() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    if (state.activeChats === 0) startClassification();
  }, IDLE_MS);
  // Don't keep scripts (like the eval) alive just for this timer.
  state.idleTimer.unref?.();
}

/** Starts classifying pending mistakes in the background, unless it's already running. */
export function startClassification(): void {
  if (state.running || getClassificationStatus().pending === 0) return;
  state.running = true;
  state.lastError = null;
  classifyPending()
    .catch((error) => {
      state.lastError = errorToMessage(error);
    })
    .finally(() => {
      state.running = false;
    });
}

/** Puts mistakes that failed to classify back in the queue. */
export function retryFailedClassifications(): void {
  db.update(schema.corrections)
    .set({ classification: "pending", classificationAttempts: 0 })
    .where(eq(schema.corrections.classification, "failed"))
    .run();
}

async function classifyPending() {
  for (;;) {
    await waitForChatIdle();
    const batch = loadPending();
    if (batch.length === 0) return;

    const forModel: ClassificationItem[] = [];
    for (const item of batch) {
      const result = ruleClassification(item);
      if (result) save(item.id, result, "rule");
      else forModel.push(item);
    }
    if (forModel.length === 0) continue;

    try {
      const { results, classifiedBy } = await classifyBatch(forModel, getSettings());
      for (const item of forModel) {
        const result = results.get(item.id);
        if (result) save(item.id, result, classifiedBy);
        else countFailedAttempt(item.id);
      }
    } catch (error) {
      // Invalid output counts against the items; an offline or rate-limited
      // provider doesn't: they stay pending for the next run.
      if (isInvalidOutput(error)) forModel.forEach((item) => countFailedAttempt(item.id));
      throw error;
    }
  }
}

async function waitForChatIdle() {
  while (state.activeChats > 0) await new Promise((resolve) => setTimeout(resolve, 500));
}

function loadPending(): ClassificationItem[] {
  return db
    .select({
      id: schema.corrections.id,
      category: schema.corrections.category,
      severity: schema.corrections.severity,
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      explanation: schema.corrections.explanation,
      message: schema.messages.content,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(eq(schema.corrections.classification, "pending"))
    .orderBy(asc(schema.corrections.createdAt))
    .limit(BATCH_SIZE)
    .all();
}

function save(id: string, result: Classification, classifiedBy: string) {
  db.update(schema.corrections)
    .set({
      classification: result.status,
      subtype: result.subtype,
      tense: result.tense,
      tenseUsed: result.tenseUsed,
      classifiedBy: result.status === "done" ? classifiedBy : null,
    })
    // Only if still pending: the learner may have fixed it by hand meanwhile.
    .where(and(eq(schema.corrections.id, id), eq(schema.corrections.classification, "pending")))
    .run();
}

function countFailedAttempt(id: string) {
  const row = db
    .select({ attempts: schema.corrections.classificationAttempts })
    .from(schema.corrections)
    .where(eq(schema.corrections.id, id))
    .get();
  if (!row) return;
  const attempts = row.attempts + 1;
  db.update(schema.corrections)
    .set({ classificationAttempts: attempts, classification: attempts >= MAX_ATTEMPTS ? "failed" : "pending" })
    .where(and(eq(schema.corrections.id, id), eq(schema.corrections.classification, "pending")))
    .run();
}

function isInvalidOutput(error: unknown) {
  return error instanceof AllModelsFailedError && error.attempts.every((a) => a.reason === "invalid response");
}

export interface ManualClassification {
  category: ErrorCategory;
  subtype: string;
  tense: Tense | null;
  tenseUsed: Tense | null;
}

/** The learner's own classification ("wrong type?"). It's final and is kept as a label for evaluations. */
export function classifyManually(id: string, input: ManualClassification): ChatCorrection | undefined {
  if (!isValidSubtype(input.category, input.subtype)) throw new Error("That type doesn't belong to the category");
  const hasTense = TENSE_CATEGORIES.includes(input.category);
  const tense = hasTense ? input.tense : null;
  const row = db
    .update(schema.corrections)
    .set({
      category: input.category,
      subtype: input.subtype,
      tense,
      tenseUsed: tense && input.tenseUsed !== tense ? input.tenseUsed : null,
      classification: "done",
      classifiedBy: "user",
    })
    .where(eq(schema.corrections.id, id))
    .returning()
    .get();
  return row ? { ...row, createdAt: row.createdAt.getTime() } : undefined;
}
