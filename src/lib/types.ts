import type { Correction, Message, Session, VocabularyEntry } from "@/db/schema";
import type { AnalysisPreview } from "@/lib/ai/analysis";
import type { FluencyMetrics } from "@/lib/fluency";

/** Serializable shapes sent from the server to client components. */
// The owner (`userId`) never leaves the server.
export type ChatCorrection = Omit<Correction, "createdAt" | "discardedAt" | "userId"> & {
  createdAt: number;
  discardedAt: number | null;
};

/** A correction the learner changed (type fixed by hand, discarded or restored), as the routes return it. */
export interface CorrectionUpdate {
  correction: ChatCorrection;
  /** Whether it counts in the stats now, with the current Settings. */
  countsInStats: boolean;
}
export type ChatVocabulary = Omit<VocabularyEntry, "createdAt" | "userId"> & { createdAt: number };

export type ChatMessage = Omit<Message, "createdAt" | "tenseCounts" | "userId"> & {
  createdAt: number;
  corrections: ChatCorrection[];
  vocabulary: ChatVocabulary[];
};

export type SessionSummary = Pick<Session, "id" | "title" | "mode"> & {
  /** An exercise set or a guided conversation started from Practice. */
  practice: boolean;
  /** The topic of a topic conversation (src/lib/topics.ts). */
  topic: string | null;
};

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

/**
 * Events of a streamed turn (`Accept: application/x-ndjson` on the send and retry routes), one JSON
 * object per line: the stored message, previews while the analysis is generated, then the result.
 */
export type TurnEvent =
  /** The stored user message (real id), sent first when a new message is sent. */
  | { type: "message"; message: ChatMessage }
  /** The analysis so far; null discards it because another attempt started. */
  | { type: "preview"; preview: AnalysisPreview | null }
  /** The saved turn, exactly what the non-streaming route returns. */
  | { type: "done"; turn: ChatMessage[] }
  | { type: "error"; error: string };

export const TURN_STREAM_TYPE = "application/x-ndjson";
