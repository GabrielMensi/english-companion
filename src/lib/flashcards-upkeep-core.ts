/**
 * Pure helpers to keep the flashcards tidy: which review rows lost their card
 * (orphans) and the choices for the new-cards-per-session setting.
 */

import type { CardKind } from "@/lib/flashcards-core";

export interface ReviewRowRef {
  id: string;
  kind: CardKind;
  cardKey: string;
}

/**
 * Review rows whose card no longer exists: its word or mistake was deleted.
 * `existing` holds every card key that can still be built, per deck. Only the
 * decks present in `existing` are checked, so a deck the caller doesn't know
 * about is never touched.
 */
export function orphanReviewIds(rows: ReviewRowRef[], existing: Partial<Record<CardKind, Set<string>>>): string[] {
  return rows.filter((r) => existing[r.kind] !== undefined && !existing[r.kind]!.has(r.cardKey)).map((r) => r.id);
}

/** Options offered in Settings for how many new cards a study session adds. */
export const NEW_CARD_LIMIT_OPTIONS = [0, 5, 10, 20, 30, 50, 100] as const;
