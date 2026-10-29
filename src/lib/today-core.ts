/** Sentences for the Today page, kept apart so they can be tested without a database. */

export function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 19) return "Good afternoon";
  return "Good evening";
}

/** What to do today, in one sentence: cards to study and the tense that needs the most work. */
export function todaySummary({
  cardsToStudy,
  focus,
  wroteThisWeek,
}: {
  cardsToStudy: number;
  /** E.g. "past simple needs work", or null when nothing stands out. */
  focus: string | null;
  wroteThisWeek: boolean;
}): string {
  const cards = cardsToStudy > 0 ? `${cardsToStudy} ${cardsToStudy === 1 ? "card" : "cards"} to study` : null;
  if (cards && focus) return `${cards}, and ${focus}.`;
  if (cards) return `${cards}.`;
  if (focus) return `${focus.charAt(0).toUpperCase()}${focus.slice(1)}.`;
  return wroteThisWeek ? "Nothing due. Write something new." : "Nothing written this week yet. Start with a chat.";
}

/** "30 messages, 1,322 words and 7.19 mistakes per 100 words, 2.47 more than the week before." */
export function weekSummary(totals: {
  messages: number;
  words: number;
  per100Words: number;
  previousPer100Words: number | null;
}): string {
  const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const base = `${n(totals.messages)} ${totals.messages === 1 ? "message" : "messages"}, ${n(totals.words)} words and ${n(totals.per100Words)} mistakes per 100 words`;
  if (totals.previousPer100Words === null) return `${base}.`;
  const delta = totals.per100Words - totals.previousPer100Words;
  if (Math.abs(delta) < 0.01) return `${base}, the same as the week before.`;
  return `${base}, ${n(Math.abs(delta))} ${delta < 0 ? "fewer" : "more"} than the week before.`;
}
