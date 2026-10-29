import "server-only";

import { asc, count, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { classifyBatch } from "@/lib/ai/classify";
import { type Classification, type ClassificationItem, ruleClassification } from "@/lib/ai/classify-core";
import { AllModelsFailedError, errorToMessage } from "@/lib/ai/fallback";
import { severityAfterManualType } from "@/lib/correction-review";
import { logRouteError } from "@/lib/server-log";
import { getSettings } from "@/lib/settings";
import { isValidSubtype } from "@/lib/subtypes";
import { type ErrorCategory, type Tense, TENSE_CATEGORIES } from "@/lib/taxonomy";

/**
 * Deferred fine classification of mistakes. The chat saves each mistake as
 * "pending"; this job classifies them in batches when the dashboard is opened,
 * when the app has been idle for a while, or on demand. A user's chat requests always go first and only
 * one batch of theirs runs at a time, so the chat stays fast and a batch doesn't use up the free tier's
 * per-minute limit right when a message needs it.
 *
 * Each user has their own job (their mistakes, their settings, their chats' priority). Only the number
 * of batches running at once is shared: a few at a time, the rest wait in line.
 */

const BATCH_SIZE = 8;
const MAX_ATTEMPTS = 3;
const IDLE_MS = 5 * 60_000;
/**
 * Users whose batches run at the same time; the rest wait their turn (a few at a time so one server doesn't
 * make many calls at once). Keys and quotas are per user, so a chat only holds back its own user's batch.
 * (With SHARED_KEYS the accounts without a key of their own do share the server key's quota; the cap keeps that mild.)
 */
const MAX_CONCURRENT_JOBS = 2;

interface JobState {
  running: boolean;
  activeChats: number;
  lastError: string | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

interface Jobs {
  byUser: Map<string, JobState>;
  /** Jobs running a batch now, and the ones waiting for a free place. */
  active: number;
  waiting: (() => void)[];
}

// Kept on globalThis so hot reloads in development don't lose it.
const globalForJob = globalThis as unknown as { __classificationJobs?: Jobs };
const jobs: Jobs = (globalForJob.__classificationJobs ??= { byUser: new Map(), active: 0, waiting: [] });

function stateOf(userId: string): JobState {
  let state = jobs.byUser.get(userId);
  if (!state) {
    state = { running: false, activeChats: 0, lastError: null, idleTimer: null };
    jobs.byUser.set(userId, state);
  }
  return state;
}

async function acquireSlot(): Promise<void> {
  if (jobs.active < MAX_CONCURRENT_JOBS) {
    jobs.active++;
    return;
  }
  // The place is handed over by releaseSlot, which keeps `active` as it is.
  await new Promise<void>((resolve) => jobs.waiting.push(resolve));
}

function releaseSlot() {
  const next = jobs.waiting.shift();
  if (next) next();
  else jobs.active--;
}

export interface ClassificationStatus {
  pending: number;
  failed: number;
  running: boolean;
  lastError: string | null;
}

export function getClassificationStatus(userId: string): ClassificationStatus {
  const state = stateOf(userId);
  const counts = db
    .select({ classification: schema.corrections.classification, n: count() })
    .from(schema.corrections)
    // Discarded mistakes wait outside the queue: they're classified if the learner restores them.
    .where(owned(schema.corrections, userId, isNull(schema.corrections.discardedAt)))
    .groupBy(schema.corrections.classification)
    .all();
  const of = (status: string) => counts.find((c) => c.classification === status)?.n ?? 0;
  return { pending: of("pending"), failed: of("failed"), running: state.running, lastError: state.lastError };
}

/** Runs one of the user's chat requests with priority: that user's classification batches wait until it's done. */
export async function withChatPriority<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const state = stateOf(userId);
  state.activeChats++;
  if (state.idleTimer) clearTimeout(state.idleTimer);
  try {
    return await run();
  } finally {
    state.activeChats--;
    scheduleIdleClassification(userId);
  }
}

function scheduleIdleClassification(userId: string) {
  const state = stateOf(userId);
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    if (state.activeChats === 0) startClassification(userId);
  }, IDLE_MS);
  // Don't keep scripts (like the eval) alive just for this timer.
  state.idleTimer.unref?.();
}

/** Starts classifying pending mistakes in the background, unless it's already running. */
export function startClassification(userId: string): void {
  const state = stateOf(userId);
  if (state.running || getClassificationStatus(userId).pending === 0) return;
  state.running = true;
  state.lastError = null;
  runJob(userId)
    .catch((error) => {
      logRouteError("background classification", error);
      state.lastError = errorToMessage(error);
    })
    .finally(() => {
      state.running = false;
    });
}

/** Puts the user's mistakes that failed to classify back in the queue. */
export function retryFailedClassifications(userId: string): void {
  db.update(schema.corrections)
    .set({ classification: "pending", classificationAttempts: 0 })
    .where(owned(schema.corrections, userId, eq(schema.corrections.classification, "failed")))
    .run();
}

async function runJob(userId: string) {
  await acquireSlot();
  try {
    await classifyPending(userId);
  } finally {
    releaseSlot();
  }
}

async function classifyPending(userId: string) {
  for (;;) {
    await waitForChatIdle(userId);
    const batch = loadPending(userId);
    if (batch.length === 0) return;

    const forModel: ClassificationItem[] = [];
    for (const item of batch) {
      const result = ruleClassification(item);
      if (result) save(userId, item.id, result, "rule");
      else forModel.push(item);
    }
    if (forModel.length === 0) continue;

    try {
      const { results, classifiedBy } = await classifyBatch(userId, forModel, getSettings(userId));
      for (const item of forModel) {
        const result = results.get(item.id);
        if (result) save(userId, item.id, result, classifiedBy);
        else countFailedAttempt(userId, item.id);
      }
    } catch (error) {
      // Invalid output counts against the items; an offline or rate-limited
      // provider doesn't: they stay pending for the next run.
      if (isInvalidOutput(error)) forModel.forEach((item) => countFailedAttempt(userId, item.id));
      throw error;
    }
  }
}

async function waitForChatIdle(userId: string) {
  const state = stateOf(userId);
  while (state.activeChats > 0) await new Promise((resolve) => setTimeout(resolve, 500));
}

function loadPending(userId: string): ClassificationItem[] {
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
    .where(
      owned(
        schema.corrections,
        userId,
        eq(schema.corrections.classification, "pending"),
        isNull(schema.corrections.discardedAt),
      ),
    )
    .orderBy(asc(schema.corrections.createdAt))
    .limit(BATCH_SIZE)
    .all();
}

function save(userId: string, id: string, result: Classification, classifiedBy: string) {
  db.update(schema.corrections)
    .set({
      classification: result.status,
      subtype: result.subtype,
      tense: result.tense,
      tenseUsed: result.tenseUsed,
      classifiedBy: result.status === "done" ? classifiedBy : null,
    })
    // Only if still pending: the learner may have fixed it by hand meanwhile.
    .where(
      owned(
        schema.corrections,
        userId,
        eq(schema.corrections.id, id),
        eq(schema.corrections.classification, "pending"),
      ),
    )
    .run();
}

function countFailedAttempt(userId: string, id: string) {
  const row = db
    .select({ attempts: schema.corrections.classificationAttempts })
    .from(schema.corrections)
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id)))
    .get();
  if (!row) return;
  const attempts = row.attempts + 1;
  db.update(schema.corrections)
    .set({ classificationAttempts: attempts, classification: attempts >= MAX_ATTEMPTS ? "failed" : "pending" })
    .where(
      owned(
        schema.corrections,
        userId,
        eq(schema.corrections.id, id),
        eq(schema.corrections.classification, "pending"),
      ),
    )
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

/**
 * The learner's own classification ("wrong type?"). It's final and is kept as a label for evaluations.
 * Picking Spelling → Typo also makes it a typo (see `severityAfterManualType`).
 */
export function classifyManually(userId: string, id: string, input: ManualClassification): boolean {
  if (!isValidSubtype(input.category, input.subtype)) throw new Error("That type doesn't belong to the category");
  const current = db
    .select({
      severity: schema.corrections.severity,
      severityBeforeTypo: schema.corrections.severityBeforeTypo,
      category: schema.corrections.category,
      subtype: schema.corrections.subtype,
    })
    .from(schema.corrections)
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id)))
    .get();
  if (!current) return false;
  const hasTense = TENSE_CATEGORIES.includes(input.category);
  const tense = hasTense ? input.tense : null;
  const result = db
    .update(schema.corrections)
    .set({
      category: input.category,
      subtype: input.subtype,
      // Typo by hand: it follows the "count typos in stats" setting, like a typo the model caught.
      ...severityAfterManualType(current, input),
      tense,
      tenseUsed: tense && input.tenseUsed !== tense ? input.tenseUsed : null,
      classification: "done",
      classifiedBy: "user",
    })
    .where(owned(schema.corrections, userId, eq(schema.corrections.id, id)))
    .run();
  return result.changes > 0;
}
