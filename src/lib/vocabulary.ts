import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { owned } from "@/db/owned";
import { groupVocabulary, type VocabularyWord } from "@/lib/vocabulary-core";

/** Every word the learner looked up with [brackets], grouped and newest first. */
export function getVocabulary(userId: string): VocabularyWord[] {
  const rows = db
    .select({
      id: schema.vocabulary.id,
      spanish: schema.vocabulary.spanish,
      english: schema.vocabulary.english,
      note: schema.vocabulary.note,
      source: schema.vocabulary.source,
      createdAt: schema.vocabulary.createdAt,
      messageId: schema.vocabulary.messageId,
      sessionId: schema.messages.sessionId,
      corrected: schema.messages.correctedText,
      content: schema.messages.content,
    })
    .from(schema.vocabulary)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.vocabulary.messageId))
    .where(owned(schema.vocabulary, userId))
    .orderBy(desc(schema.vocabulary.createdAt))
    .all();

  return groupVocabulary(
    rows.map(({ corrected, content, createdAt, ...r }) => ({
      ...r,
      createdAt: createdAt.getTime(),
      context: corrected ?? content,
    })),
  );
}

export function deleteVocabulary(userId: string, ids: string[]) {
  if (ids.length > 0) {
    db.delete(schema.vocabulary)
      .where(owned(schema.vocabulary, userId, inArray(schema.vocabulary.id, ids)))
      .run();
  }
}
