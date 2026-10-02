import type { Correction, Message, Session, VocabularyEntry } from "@/db/schema";
import type { AnalysisPreview } from "@/lib/ai/analysis";
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
