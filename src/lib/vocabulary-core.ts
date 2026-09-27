/**
 * Pure grouping of vocabulary lookups (words written between [brackets]).
 * The same word looked up several times becomes one entry, which is also the
 * unit future flashcards will use.
 */

export interface VocabularyRow {
  id: string;
  spanish: string;
  english: string[];
  note: string | null;
  createdAt: number;
  messageId: string;
  sessionId: string;
  /** The corrected message, where the English option was used. */
  context: string;
}

export interface VocabularyWord {
  /** Normalized key (lowercase, no accents) used to group lookups. */
  key: string;
  spanish: string;
  /** English options from the most recent lookup. */
  english: string[];
  note: string | null;
  timesLookedUp: number;
  firstSeen: number;
  lastSeen: number;
  /** Every lookup row id, so the whole word can be deleted at once. */
  ids: string[];
  /** Most recent sentences where the word was used, newest first (max 3). */
  contexts: { messageId: string; sessionId: string; text: string }[];
}

export function wordKey(spanish: string): string {
  return spanish
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function groupVocabulary(rows: VocabularyRow[]): VocabularyWord[] {
  const words = new Map<string, VocabularyWord>();
  // Newest first, so the first row of each word holds the latest translation.
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);

  for (const row of sorted) {
    const key = wordKey(row.spanish);
    let word = words.get(key);
    if (!word) {
      word = {
        key,
        spanish: row.spanish,
        english: row.english,
        note: row.note,
        timesLookedUp: 0,
        firstSeen: row.createdAt,
        lastSeen: row.createdAt,
        ids: [],
        contexts: [],
      };
      words.set(key, word);
    }
    word.timesLookedUp++;
    word.firstSeen = Math.min(word.firstSeen, row.createdAt);
    word.ids.push(row.id);
    if (word.contexts.length < 3 && !word.contexts.some((c) => c.messageId === row.messageId)) {
      word.contexts.push({ messageId: row.messageId, sessionId: row.sessionId, text: row.context });
    }
  }

  return [...words.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}
