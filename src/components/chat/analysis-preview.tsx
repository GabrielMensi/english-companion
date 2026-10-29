"use client";

import { ArrowRight, Bot, Loader2, MessageCircleHeart } from "lucide-react";

import { DiffText } from "@/components/chat/diff-text";
import { SeverityBadge } from "@/components/severity-badge";
import type { AnalysisPreview } from "@/lib/ai/analysis";
import { categoryLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

/**
 * The correction while the model writes it. Read-only on purpose (no copy, listen or "wrong type?"):
 * the text can still change, and the saved result replaces this view when it's ready.
 */
export function AnalysisPreviewView({
  original,
  preview,
  compact = false,
}: {
  /** The learner's message. */
  original: string;
  preview: AnalysisPreview;
  /** The floating window: no severity badges or native version, to save space. */
  compact?: boolean;
}) {
  const corrected = preview.correctedText?.trim() || null;
  // Suggestions have their own section in the final card: they show up when it's ready.
  const errors = preview.errors.filter((e) => e.severity !== "suggestion");

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4 rounded-xl border bg-card p-4")}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Correcting…
      </div>

      {corrected &&
        (preview.correctedDone ? (
          corrected !== original ? (
            <DiffText from={original} to={corrected} />
          ) : (
            <p className="font-serif text-reading whitespace-pre-wrap">{original}</p>
          )
        ) : (
          <p className="font-serif text-reading whitespace-pre-wrap">
            {corrected}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted-foreground/40 align-middle" />
          </p>
        ))}

      {errors.length > 0 && (
        <ul className={cn("flex flex-col", compact ? "gap-2.5" : "gap-3 text-sm")}>
          {errors.map((e, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <div className={cn("flex flex-wrap items-center", compact ? "gap-1.5" : "gap-2")}>
                {!compact && <SeverityBadge severity={e.severity} />}
                <span className="font-serif text-base text-mark-wrong line-through">{e.original}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="font-serif text-base font-medium text-mark-right">{e.correction}</span>
                <span className="text-xs text-muted-foreground">{categoryLabel(e.category)}</span>
              </div>
              {e.explanation && <p className="text-muted-foreground">{e.explanation}</p>}
            </li>
          ))}
        </ul>
      )}

      {!compact && preview.naturalText && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <MessageCircleHeart className="size-4" />
            How a native speaker would say it
          </div>
          <p className="font-serif text-reading whitespace-pre-wrap">{preview.naturalText}</p>
        </div>
      )}

      {preview.reply && (
        <div className={cn("flex gap-2", compact ? "border-t pt-3" : "border-t pt-4")}>
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bot className="size-3.5" />
          </div>
          <p className="flex-1 font-serif text-reading whitespace-pre-wrap">{preview.reply}</p>
        </div>
      )}
    </div>
  );
}
