"use client";

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { AnalysisCard } from "@/components/chat/analysis-card";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

export function UserMessage({
  message,
  onRetry,
  onUpdate,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
  onUpdate: (message: Partial<ChatMessage> & { id: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>

      {message.status === "pending" && (
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
