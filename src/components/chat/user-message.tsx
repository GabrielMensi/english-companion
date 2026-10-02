"use client";

import { AlertTriangle, Loader2, Mic, RotateCcw } from "lucide-react";
import { AnalysisCard } from "@/components/chat/analysis-card";
import { AnalysisPreviewView } from "@/components/chat/analysis-preview";
import { Button } from "@/components/ui/button";
import type { AnalysisPreview } from "@/lib/ai/analysis";
import { fluencySummary } from "@/lib/fluency";
import type { ChatMessage } from "@/lib/types";

export function UserMessage({
  message,
  preview,
  onRetry,
  onUpdate,
}: {
  message: ChatMessage;
  /** The analysis while it streams. */
  preview?: AnalysisPreview;
  onRetry: (id: string) => void;
  onUpdate: (message: Partial<ChatMessage> & { id: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
      {message.inputMode === "spoken" && (
        <div
          className="-mt-1 flex items-center gap-1 self-end text-xs text-muted-foreground"
          title="Dictated. Spelling, punctuation and capitalization come from the transcription, so they're not corrected. Articles, prepositions, pronouns, plurals and questions are corrected but don't count in the stats."
        >
          <Mic className="size-3" />
          Spoken{message.audioDurationMs ? ` · ${formatDuration(message.audioDurationMs)}` : ""}
          {message.transcriptEdited && " · transcript edited"}
          {message.fluency && <FluencyNote fluency={message.fluency} />}
        </div>
      )}

      {/* Until the model writes something, the plain spinner (an empty card would just flash). */}
      {message.status === "pending" && preview?.correctedText && (
        <AnalysisPreviewView original={message.content} preview={preview} />
      )}

      {message.status === "pending" && !preview?.correctedText && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Correcting…
        </div>
      )}

      {message.status === "error" && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{message.errorMessage ?? "Couldn't analyze the message."}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => onRetry(message.id)}>
            <RotateCcw /> Retry
          </Button>
        </div>
      )}

      {message.status === "done" && <AnalysisCard message={message} onUpdate={onUpdate} />}
    </div>
  );
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Pace, long pauses and fillers of a dictated message, e.g. "· 118 wpm · 1 long pause · 2 fillers". */
export function FluencyNote({ fluency }: { fluency: NonNullable<ChatMessage["fluency"]> }) {
  const { wpm, fillerCount, topFillers } = fluencySummary(fluency);
  const parts = [
    wpm !== null && `${wpm} wpm`,
    fluency.pauses > 0 && `${fluency.pauses} long ${fluency.pauses === 1 ? "pause" : "pauses"}`,
    fillerCount > 0 && `${fillerCount} ${fillerCount === 1 ? "filler" : "fillers"}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  const title = [
    wpm !== null && `Pace: ${wpm} words per minute while speaking.`,
    fluency.pauses > 0 &&
      `Silences of a second or more: ${fluency.pauses} (longest ${(fluency.longestPauseMs / 1000).toFixed(1)} s).`,
    fillerCount > 0 && `Fillers: ${topFillers.map((f) => `${f.filler} ×${f.count}`).join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return <span title={title}> · {parts.join(" · ")}</span>;
}
