/**
 * Pure derived state of a message's correction card (and of the floating
 * window's summary): which section each correction goes in, the counts, the
 * headline and the reference numbers on the marked text. Recomputed from the
 * stored corrections on every render, so marking a typo or discarding a
 * correction updates everything at once.
 */
import { type MarkableCorrection, type MarkedDiff, markDiff } from "@/lib/correction-marks";
import type { Severity } from "@/lib/taxonomy";

export interface CardCorrection extends MarkableCorrection {
  discardedAt: number | null;
}

export interface CardSections<C extends CardCorrection> {
  /** Real mistakes (minor, moderate, major), not discarded. */
  mistakes: C[];
  typos: C[];
  suggestions: C[];
  /** Corrections the learner discarded as wrong, whatever their severity. */
  discarded: C[];
  /** Per severity, without discarded ones. */
  counts: Record<Severity, number>;
  /** "No mistakes, just a typo." and the like; null when there are mistakes. */
  headline: string | null;
  /** "2 typos and 1 suggestion"; null when there are neither. */
  extrasSummary: string | null;
  /** Marked text and the reference number of each correction. */
  marked: MarkedDiff;
}

export function cardSections<C extends CardCorrection>(
  content: string,
  corrected: string,
  corrections: C[],
): CardSections<C> {
  const active = corrections.filter((c) => c.discardedAt === null);
  const mistakes = active.filter((c) => c.severity !== "suggestion" && c.severity !== "typo");
  const typos = active.filter((c) => c.severity === "typo");
  const suggestions = active.filter((c) => c.severity === "suggestion");
  const counts: Record<Severity, number> = { suggestion: 0, typo: 0, minor: 0, moderate: 0, major: 0 };
  for (const c of active) counts[c.severity]++;

  return {
    mistakes,
    typos,
    suggestions,
    discarded: corrections.filter((c) => c.discardedAt !== null),
    counts,
    headline: mistakes.length > 0 ? null : headline(typos.length, corrected === content),
    extrasSummary:
      [plural(typos.length, "typo"), plural(suggestions.length, "suggestion")].filter(Boolean).join(" and ") || null,
    // Every correction, in the stored order whatever its section, so its number
    // doesn't change when it moves to another one (the corrected text stays the same).
    marked: markDiff(content, corrected, corrections),
  };
}

function headline(typos: number, unchanged: boolean): string {
  if (typos > 0) return `No mistakes, just ${typos === 1 ? "a typo" : `${typos} typos`}.`;
  return unchanged ? "Perfect! No mistakes." : "No mistakes.";
}

function plural(n: number, word: string): string | null {
  return n > 0 ? `${n} ${n === 1 ? word : `${word}s`}` : null;
}

/** The note shown when a change by hand moves a correction in or out of the stats; null when nothing worth saying changed. */
export function reviewFeedback(
  before: { severity: Severity; discardedAt: number | null },
  after: { severity: Severity; discardedAt: number | null },
  countsInStats: boolean,
): string | null {
  if (before.discardedAt === null && after.discardedAt !== null) return "Discarded: it won’t count in your stats";
  if (before.discardedAt !== null && after.discardedAt === null) {
    return countsInStats ? "Restored: it counts in your stats again" : "Restored";
  }
  if (before.severity !== "typo" && after.severity === "typo") {
    return countsInStats
      ? "Marked as a typo: it still counts, because typos are on in Settings"
      : "Marked as a typo: it won’t count in your stats";
  }
  if (before.severity === "typo" && after.severity !== "typo" && countsInStats) {
    return "No longer a typo: it counts in your stats";
  }
  return null;
}
