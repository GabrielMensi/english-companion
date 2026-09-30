import type { Correction, Message, Session, VocabularyEntry } from "@/db/schema";
import type { FluencyMetrics } from "@/lib/fluency";

/** Serializable shapes sent from the server to client components. */
export type ChatCorrection = Omit<Correction, "createdAt"> & { createdAt: number };
export type ChatVocabulary = Omit<VocabularyEntry, "createdAt"> & { createdAt: number };

export type ChatMessage = Omit<Message, "createdAt" | "tenseCounts"> & {
  createdAt: number;
  corrections: ChatCorrection[];
  vocabulary: ChatVocabulary[];
};

export type SessionSummary = Pick<Session, "id" | "title" | "mode">;

/** How a dictated message was transcribed, sent along with its (possibly edited) text. */
export interface VoiceInput {
  transcriptRaw: string;
  transcriptEdited: boolean;
  transcriptionProvider: string;
  transcriptionModel: string;
  audioDurationMs: number;
  /** Null when speech-to-text gave no word timestamps. */
  fluency: FluencyMetrics | null;
}
