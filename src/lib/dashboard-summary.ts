/** The dashboard's opening sentences, kept apart so they can be tested without a database. */

const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "6.43 mistakes per 100 words, 0.4 fewer than the previous 30 days." */
export function dashboardHeadline(
  totals: { per100Words: number; previousPer100Words: number | null },
  /** Length of the selected period; null for all time. */
  days: number | null,
): string {
  const base = `${n(totals.per100Words)} mistakes per 100 words`;
  if (totals.previousPer100Words === null || days === null) return `${base}.`;
  const period = `the previous ${days} days`;
  const delta = totals.per100Words - totals.previousPer100Words;
  if (Math.abs(delta) < 0.01) return `${base}, the same as ${period}.`;
  return `${base}, ${n(Math.abs(delta))} ${delta < 0 ? "fewer" : "more"} than ${period}.`;
}

/** "13% of your 40 messages had no mistakes. 1,914 words written, 25 typos not counted." */
export function dashboardDetail(
  totals: { messages: number; cleanMessagesPct: number; words: number; typos: number },
  countTypos: boolean,
): string {
  const messages = `${n(totals.messages)} ${totals.messages === 1 ? "message" : "messages"}`;
  const clean = `${Math.round(totals.cleanMessagesPct)}% of your ${messages} had no mistakes.`;
  const words = `${n(totals.words)} words written`;
  if (countTypos || totals.typos === 0) return `${clean} ${words}.`;
  return `${clean} ${words}, ${n(totals.typos)} ${totals.typos === 1 ? "typo" : "typos"} not counted.`;
}
