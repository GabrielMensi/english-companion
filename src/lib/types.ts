import type { Correction, Message, Session, VocabularyEntry } from "@/db/schema";

/** Serializable shapes sent from the server to client components. */
export type ChatCorrection = Omit<Correction, "createdAt"> & { createdAt: number };
export type ChatVocabulary = Omit<VocabularyEntry, "createdAt"> & { createdAt: number };

export type ChatMessage = Omit<Message, "createdAt"> & {
  createdAt: number;
  corrections: ChatCorrection[];
  vocabulary: ChatVocabulary[];
};

export type SessionSummary = Pick<Session, "id" | "title" | "mode">;
