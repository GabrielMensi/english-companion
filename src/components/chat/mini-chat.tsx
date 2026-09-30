"use client";

import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardCheck, Loader2, RotateCcw, X } from "lucide-react";
import { Composer, type ComposerState, type Notify } from "@/components/chat/composer";
import { DiffText } from "@/components/chat/diff-text";
import { CopyButton, copyText } from "@/components/copy-button";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import type { SessionMode } from "@/db/schema";
import { categoryLabel, SEVERITIES } from "@/lib/taxonomy";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Notice {
  kind: "error" | "info";
  message: string;
}

/**
 * The floating window's content: the last correction and the composer, so you can write or dictate
 * while working in another app. Radix popups and toasts portal into the main document (the hidden
 * tab), so this view avoids them: messages show inline as a `Notice`.
 */
export function MiniChat({
  title,
  mode,
  message,
  reply,
  composer,
  canDictate,
  notice,
  onDismissNotice,
  notify,
  onRetry,
  onClose,
}: {
  title: string;
  mode: SessionMode;
  /** The last message the user sent, if any. */
  message: ChatMessage | undefined;
  /** The tutor's reply to it (conversation mode). */
  reply: ChatMessage | undefined;
  composer: ComposerState;
  canDictate: boolean;
  notice: Notice | null;
  onDismissNotice: () => void;
  notify: Notify;
  onRetry: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col text-sm">
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {mode === "conversation" ? "Conversation" : "Correction"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {message ? (
          <LastCorrection message={message} reply={reply} notify={notify} onRetry={onRetry} onClose={onClose} />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            Write or dictate something in English: the correction shows up here, ready to copy.
          </p>
        )}
      </div>

      {notice && (
        <div
          className={cn(
            "mx-3 mb-2 flex items-start gap-2 rounded-lg border px-3 py-2",
            notice.kind === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/50",
          )}
        >
          <span className="flex-1">{notice.message}</span>
          <Button variant="ghost" size="icon-xs" onClick={onDismissNotice} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      )}

      <div className="border-t p-3">
        <Composer composer={composer} canDictate={canDictate} />
      </div>
    </div>
  );
}

function LastCorrection({
  message,
  reply,
  notify,
  onRetry,
  onClose,
}: {
  message: ChatMessage;
  reply: ChatMessage | undefined;
  notify: Notify;
  onRetry: (id: string) => void;
  onClose: () => void;
}) {
  if (message.status === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{message.content}</p>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Correcting…
        </div>
      </div>
    );
  }

  if (message.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{message.content}</p>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{message.errorMessage ?? "Couldn't analyze the message."}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => onRetry(message.id)}>
            <RotateCcw /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const corrected = message.correctedText ?? message.content;
  const errors = message.corrections.filter((c) => c.severity !== "suggestion");

  const copyFailed = () => notify("error", "Couldn't copy to the clipboard");

  async function copyAndClose(event: React.MouseEvent<HTMLButtonElement>) {
    try {
      await copyText(corrected, event.currentTarget);
      onClose();
    } catch {
      copyFailed();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {errors.length === 0 ? (
        <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {corrected === message.content ? "Perfect! No mistakes." : "No mistakes."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {SEVERITIES.filter((s) => s !== "suggestion").map((s) => {
            const count = errors.filter((e) => e.severity === s).length;
            return count > 0 ? (
              <SeverityBadge key={s} severity={s}>
                {count}
              </SeverityBadge>
            ) : null;
          })}
        </div>
      )}

      {corrected !== message.content ? (
        <DiffText from={message.content} to={corrected} />
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      )}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {errors.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-red-600/90 line-through dark:text-red-400/90">{e.original}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{e.correction}</span>
                <span className="text-xs text-muted-foreground">· {categoryLabel(e.category)}</span>
              </div>
              <p className="text-muted-foreground">{e.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="-mb-1 flex flex-wrap gap-1 border-t pt-2">
        <CopyButton text={corrected} label="Copy corrected" onError={copyFailed} />
        {message.improvedPrompt && <CopyButton text={message.improvedPrompt} label="Copy prompt" onError={copyFailed} />}
        <Button variant="ghost" size="sm" onClick={copyAndClose} title="Copy the corrected text and close this window">
          <ClipboardCheck />
          Copy &amp; close
        </Button>
      </div>

      {reply && (
        <div className="flex gap-2 border-t pt-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bot className="size-3.5" />
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">{reply.content}</p>
        </div>
      )}
    </div>
  );
}
