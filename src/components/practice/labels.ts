import type { Tone } from "@/components/status-badge";
import type { CategoryTarget } from "@/lib/category-practice";
import type { PracticeTarget } from "@/lib/tense-practice";

/** How each practice suggestion is labeled, on the Practice page and on Today. */
export const STATUS: Record<PracticeTarget["status"], { label: string; tone: Tone }> = {
  weak: { label: "Needs work", tone: "bad" },
  shaky: { label: "Getting there", tone: "warn" },
  avoided: { label: "Rarely used", tone: "optional" },
  not_enough_data: { label: "Few uses, some mistakes", tone: "neutral" },
  strong: { label: "Strong", tone: "good" },
  suggested: { label: "Suggested", tone: "neutral" },
};

export const CATEGORY_STATUS: Record<CategoryTarget["status"], { label: string; tone: Tone }> = {
  weak: { label: "Most mistakes", tone: "bad" },
  suggested: { label: "Suggested", tone: "neutral" },
};

export const EXERCISE_LABELS: Record<PracticeTarget["kind"], string> = {
  contrast: "Contrast exercise",
  form: "Form drill",
  use: "Use it in sentences",
};
