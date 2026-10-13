"use client";

import { BookOpen, CheckCircle2, ChevronRight, Loader2, MessageCircleHeart, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { DiffText } from "@/components/chat/diff-text";
import { MistakeGroups, MistakeItem } from "@/components/chat/mistake-list";
import { ModelInfo, ModelNote } from "@/components/chat/model-note";
import { CopyButton } from "@/components/copy-button";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { cardSections, reviewFeedback } from "@/lib/analysis-card-core";
import { api, restoreCorrection } from "@/lib/api";
import type { ChatMessage, CorrectionUpdate } from "@/lib/types";

/** How long a correction stays highlighted after it moves to another section. */
const HIGHLIGHT_MS = 2500;

export function AnalysisCard({
  message,
  onUpdate,
}: {
  message: ChatMessage;
  onUpdate: (message: Partial<ChatMessage> & { id: string }) => void;
}) {
  const [improving, setImproving] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const corrected = message.correctedText ?? message.content;
  const { mistakes, typos, suggestions, discarded, counts, headline, extrasSummary, marked } = cardSections(
    message.content,
    corrected,
    message.corrections,
  );

  // The latest corrections, for updates that land later (a toast's Undo).
  const latest = useRef(message.corrections);
  useEffect(() => {
    latest.current = message.corrections;
  }, [message.corrections]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  /** Shows a correction changed by hand (type, discard, undo) and says how it affects the stats. */
  function updateCorrection({ correction, countsInStats }: CorrectionUpdate) {
    const before = latest.current.find((c) => c.id === correction.id);
    latest.current = latest.current.map((c) => (c.id === correction.id ? correction : c));
    onUpdate({ id: message.id, corrections: latest.current });
    if (!before) return;

    // A mistake that became a typo moves to the collapsed section: open it and point it out.
    if (before.severity !== "typo" && correction.severity === "typo" && correction.discardedAt === null) {
      setExtrasOpen(true);
      setHighlight(correction.id);
    }
    const note = reviewFeedback(before, correction, countsInStats);
    if (!note) return;
    if (before.discardedAt === null && correction.discardedAt !== null) {
      toast(note, {
        action: {
          label: "Undo",
          onClick: () => {
            restoreCorrection(correction.id)
              .then(updateCorrection)
              .catch((error: Error) => toast.error(error.message));
          },
        },
      });
    } else {
      toast(note);
    }
  }

  async function improve() {
    setImproving(true);
    try {
      const update = await api<
        Pick<
          ChatMessage,
          "improvedPrompt" | "improvedPromptProvider" | "improvedPromptModel" | "improvedPromptDurationMs"
        >
      >(`/api/messages/${message.id}/prompt`, { method: "POST" });
      onUpdate({ id: message.id, ...update });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      {headline && (
        <div className="flex items-center gap-2 text-sm font-medium text-mark-right">
          <CheckCircle2 className="size-4" />
          {headline}
        </div>
      )}

      {corrected !== message.content ? (
        <DiffText from={message.content} to={corrected} segments={marked.segments} />
      ) : (
        mistakes.length + typos.length + discarded.length > 0 && (
          <p className="font-serif text-reading whitespace-pre-wrap">{message.content}</p>
        )
      )}

      {message.naturalText && (
        <div className="flex flex-col gap-1 border-l-2 pl-4">
          <SectionTitle icon={<MessageCircleHeart className="size-4" />}>
            How a native speaker would say it
          </SectionTitle>
          <div className="flex items-start gap-1">
            <p className="flex-1 font-serif text-reading whitespace-pre-wrap italic">{message.naturalText}</p>
            <SpeakButton text={message.naturalText} />
            <CopyButton text={message.naturalText} />
          </div>
        </div>
      )}

      {mistakes.length > 0 && (
        <section className="flex flex-col gap-3 border-t pt-4" aria-label="Mistakes">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {mistakes.length} {mistakes.length === 1 ? "mistake" : "mistakes"}
            </h3>
            {(["major", "moderate", "minor"] as const).map((s) =>
              counts[s] > 0 ? (
                <SeverityBadge key={s} severity={s}>
                  {counts[s]}
                </SeverityBadge>
              ) : null,
            )}
          </div>
          <MistakeGroups
            mistakes={mistakes}
            numbers={marked.numbers}
            highlight={highlight}
            onUpdate={updateCorrection}
          />
        </section>
      )}

      {extrasSummary && (
        <details
          className="group/details border-t pt-4"
          open={extrasOpen}
          onToggle={(e) => setExtrasOpen(e.currentTarget.open)}
        >
          <Summary>
            {extrasSummary}
            <span className="font-normal">(don’t count as mistakes)</span>
          </Summary>
          <ul className="mt-3 flex flex-col gap-3">
            {typos.map((e) => (
              <MistakeItem
                key={e.id}
                error={e}
                number={marked.numbers.get(e.id)}
                highlighted={e.id === highlight}
                onUpdate={updateCorrection}
              />
            ))}
            {suggestions.map((e) => (
              <MistakeItem key={e.id} error={e} number={marked.numbers.get(e.id)} />
            ))}
          </ul>
        </details>
      )}

      {discarded.length > 0 && (
        <details className="group/details border-t pt-4">
          <Summary>
            {discarded.length} discarded
            <span className="font-normal">(wrong corrections, not counted)</span>
          </Summary>
          <ul className="mt-3 flex flex-col gap-3">
            {discarded.map((e) => (
              <MistakeItem key={e.id} error={e} number={marked.numbers.get(e.id)} onUpdate={updateCorrection} />
            ))}
          </ul>
        </details>
      )}

      {message.vocabulary.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <SectionTitle icon={<BookOpen className="size-4" />}>Vocabulary</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm">
            {message.vocabulary.map((v) => (
              <li key={v.id}>
                <span className="text-muted-foreground">{v.spanish}</span> →{" "}
                <span className="font-serif text-base font-medium">{v.english.join(" / ")}</span>{" "}
                <span className="inline-block align-middle">
                  <SpeakButton text={v.english.join(", ")} />
                </span>
                {v.note && <span className="text-muted-foreground"> — {v.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message.improvedPrompt && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <SectionTitle icon={<Sparkles className="size-4" />}>Improved prompt</SectionTitle>
          <pre className="rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {message.improvedPrompt}
          </pre>
          <ModelNote
            verb="Generated by"
            provider={message.improvedPromptProvider}
            model={message.improvedPromptModel}
            durationMs={message.improvedPromptDurationMs}
          />
        </div>
      )}

      <div className="-mb-2 flex flex-wrap items-center gap-1 border-t pt-2">
        <SpeakButton text={corrected} label="Listen" />
        <CopyButton text={corrected} label="Copy corrected" />
        {message.improvedPrompt ? (
          <>
            <CopyButton text={message.improvedPrompt} label="Copy prompt" />
            <Button variant="ghost" size="sm" onClick={improve} disabled={improving}>
              {improving ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Regenerate prompt
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={improve} disabled={improving}>
            {improving ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Turn into prompt
          </Button>
        )}
        <div className="ml-auto">
          <ModelInfo
            verb="Corrected by"
            provider={message.provider}
            model={message.model}
            durationMs={message.durationMs}
            fallbackAttempts={message.fallbackAttempts}
          />
        </div>
      </div>
    </div>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 transition-transform group-open/details:rotate-90" />
      {children}
    </summary>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
