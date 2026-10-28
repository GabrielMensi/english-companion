/**
 * Pure rule for keeping the learner's own review when a message is analyzed again (retry): which
 * new correction is the same mistake as an old one, and what carries over to it.
 */
import type { Correction } from "@/db/schema";
import { severityAfterManualType } from "@/lib/correction-review";
import type { ErrorCategory, Severity } from "@/lib/taxonomy";

/** What an old correction needs to have for its review to be carried over. */
export type ReviewedCorrection = Pick<
  Correction,
  | "original"
  | "correction"
  | "category"
  | "subtype"
  | "tense"
  | "tenseUsed"
  | "severity"
  | "severityBeforeTypo"
  | "classifiedBy"
  | "discardedAt"
  | "discardReason"
>;

/** What a freshly generated correction has, before it's stored. */
export interface NewCorrection {
  original: string;
  correction: string;
  category: ErrorCategory;
  severity: Severity;
}

/** The columns to set on a new correction to keep the learner's review. Empty when there is nothing to keep. */
export type CarriedReview = Partial<
  Pick<
    Correction,
    | "discardedAt"
    | "discardReason"
    | "category"
    | "subtype"
    | "tense"
    | "tenseUsed"
    | "severity"
    | "severityBeforeTypo"
    | "classification"
    | "classifiedBy"
  >
>;

/** The fragment without differences in case, spacing or surrounding punctuation. */
export function normalizeOriginal(original: string): string {
  return original
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:!?()-]+|[\s"'.,;:!?()-]+$/g, "");
}

const isManual = (c: ReviewedCorrection) => c.classifiedBy === "user";
const sameCorrection = (a: { correction: string }, b: { correction: string }) =>
  normalizeOriginal(a.correction) === normalizeOriginal(b.correction);

/**
 * For each new correction, the review to keep from the old ones (same index), or `{}`.
 *
 * Two different decisions, on purpose:
 * - A **discard** ("this correction is wrong") carries over only when both the fragment (`original`)
 *   and the suggested fix (`correction`) are the same, ignoring case, spacing and edge punctuation:
 *   a different fix is a different claim, and the learner didn't judge it.
 * - The learner's **own type** (including the typo mark) is about the fragment, so it carries over
 *   whenever `original` matches. It is final, kept as a label, and the typo mark is applied to the
 *   new severity as if it had been set by hand.
 *
 * The model may call the same fragment another category the second time, so the category only
 * breaks ties: with several old reviews on the same fragment, the one with the same category goes
 * first. Each old correction is used once, in order, so two corrections on a repeated word don't
 * both inherit one review.
 */
export function carryOverReviews(
  previous: readonly ReviewedCorrection[],
  next: readonly NewCorrection[],
): CarriedReview[] {
  const pool = [...previous];
  return next.map((current) => {
    const key = normalizeOriginal(current.original);
    const candidates = pool.filter(
      (p) =>
        normalizeOriginal(p.original) === key &&
        (isManual(p) || (p.discardedAt !== null && sameCorrection(p, current))),
    );
    const match = candidates.find((p) => p.category === current.category) ?? candidates[0];
    if (!match) return {};
    pool.splice(pool.indexOf(match), 1);

    const carried: CarriedReview = {};
    if (match.discardedAt && sameCorrection(match, current)) {
      carried.discardedAt = match.discardedAt;
      carried.discardReason = match.discardReason;
    }
    if (isManual(match)) {
      const manual = { category: match.category, subtype: match.subtype ?? "" };
      Object.assign(carried, {
        ...manual,
        ...severityAfterManualType({ ...current, subtype: null, severityBeforeTypo: null }, manual),
        tense: match.tense,
        tenseUsed: match.tenseUsed,
        classification: "done" as const,
        classifiedBy: "user",
      });
    }
    return carried;
  });
}
