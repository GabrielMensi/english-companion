/**
 * Pure rules for the learner's own review of a reported mistake: fixing its
 * type by hand ("Wrong type?") and discarding a wrong correction.
 */
import type { ErrorCategory, Severity } from "@/lib/taxonomy";

/** The type the model and the classifier use for an accidental keyboard slip. */
export function isTypoType(category: ErrorCategory, subtype: string | null): boolean {
  return category === "spelling" && subtype === "keyboard_typo";
}

export interface SeverityState {
  severity: Severity;
  /** The severity before the learner marked it as a typo by hand, if they did. */
  severityBeforeTypo: Severity | null;
}

/**
 * The severity after the learner picks a type by hand. Picking Spelling → Typo
 * makes it a typo (so it follows the "count typos in stats" setting) and
 * remembers the severity it had; moving it away from Typo gives that severity
 * back, or "minor" when it was a typo without a stored one.
 */
export function severityAfterManualType(
  current: SeverityState & { category: ErrorCategory; subtype: string | null },
  next: { category: ErrorCategory; subtype: string },
): SeverityState {
  if (isTypoType(next.category, next.subtype)) {
    if (current.severity === "typo") return { severity: "typo", severityBeforeTypo: current.severityBeforeTypo };
    return { severity: "typo", severityBeforeTypo: current.severity };
  }
  if (current.severityBeforeTypo) return { severity: current.severityBeforeTypo, severityBeforeTypo: null };
  if (current.severity === "typo" && isTypoType(current.category, current.subtype)) {
    return { severity: "minor", severityBeforeTypo: null };
  }
  return { severity: current.severity, severityBeforeTypo: null };
}
