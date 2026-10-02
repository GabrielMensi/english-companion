/**
 * Spaced repetition scheduling, SM-2 style (the algorithm behind Anki and
 * SuperMemo 2), shared by every flashcard deck. Pure: the caller passes the
 * current time and stores the returned state in the `reviews` table.
 *
 * The learner grades each answer with four buttons, mapped to SM-2 quality:
 * again = 1 (forgot), hard = 3, good = 4, easy = 5.
 */

export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
/** A forgotten card comes back after this long (usually in the same session). */
export const RELEARN_DELAY_MS = 10 * 60_000;

const DAY = 86_400_000;

export interface ReviewState {
  /** Ease factor: how fast the interval grows. */
  ease: number;
  /** Days until the next review; 0 while the card is being (re)learned. */
  intervalDays: number;
  /** Correct answers in a row. */
  repetitions: number;
  /** Times the card was forgotten after having been learned. */
  lapses: number;
  dueAt: number;
}

export function newReviewState(now: number): ReviewState {
  return { ease: DEFAULT_EASE, intervalDays: 0, repetitions: 0, lapses: 0, dueAt: now };
}

/** SM-2 ease update: ease + (0.1 − (5 − q)(0.08 + (5 − q)·0.02)), never below MIN_EASE. */
export function nextEase(ease: number, grade: Grade): number {
  const d = 5 - QUALITY[grade];
  const next = ease + (0.1 - d * (0.08 + d * 0.02));
  return Math.max(MIN_EASE, Math.round(next * 100) / 100);
}

/** The state after answering a card with `grade` at `now`. */
export function schedule(state: ReviewState, grade: Grade, now: number): ReviewState {
  const ease = nextEase(state.ease, grade);

  if (grade === "again") {
    return {
      ease,
      intervalDays: 0,
      repetitions: 0,
      lapses: state.repetitions > 0 ? state.lapses + 1 : state.lapses,
      dueAt: now + RELEARN_DELAY_MS,
    };
  }

  const previous = state.intervalDays;
  let interval: number;
  if (state.repetitions === 0) {
    interval = grade === "easy" ? 4 : 1;
  } else if (state.repetitions === 1) {
    interval = grade === "hard" ? 3 : grade === "good" ? 6 : 8;
  } else if (grade === "hard") {
    interval = Math.round(previous * 1.2);
  } else if (grade === "good") {
    interval = Math.round(previous * ease);
  } else {
    interval = Math.round(previous * ease * 1.3);
  }
  // Always move forward at least one day, so a card never gets stuck.
  if (state.repetitions > 1) interval = Math.max(previous + 1, interval);

  return {
    ease,
    intervalDays: interval,
    repetitions: state.repetitions + 1,
    lapses: state.lapses,
    dueAt: now + interval * DAY,
  };
}

/** When each button would show the card again, for the button labels. */
export function previewIntervals(state: ReviewState, now: number): Record<Grade, number> {
  return Object.fromEntries(GRADES.map((g) => [g, schedule(state, g, now).dueAt - now])) as Record<Grade, number>;
}

/** Short human label for a delay: "10 min", "1 day", "3 weeks", "2 months". */
export function formatDelay(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / DAY);
  if (days < 14) return days === 1 ? "1 day" : `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  const years = Math.round((days / 365) * 10) / 10;
  return years === 1 ? "1 year" : `${years} years`;
}
