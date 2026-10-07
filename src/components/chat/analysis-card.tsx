"use client";

import { BookOpen, CheckCircle2, ChevronRight, Loader2, MessageCircleHeart, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { DiffText } from "@/components/chat/diff-text";
import { MistakeGroups, MistakeItem } from "@/components/chat/mistake-list";
import { ModelInfo, ModelNote } from "@/components/chat/model-note";
import { CopyButton } from "@/components/copy-button";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { markDiff } from "@/lib/correction-marks";
import type { ChatCorrection, ChatMessage } from "@/lib/types";

export function AnalysisCard({
  message,
  onUpdate,
}: {
  message: ChatMessage;
  onUpdate: (message: Partial<ChatMessage> & { id: string }) => void;
}) {
  const [improving, setImproving] = useState(false);
  const corrected = message.correctedText ?? message.content;
  const mistakes = message.corrections.filter((c) => c.severity !== "suggestion" && c.severity !== "typo");
  const typos = message.corrections.filter((c) => c.severity === "typo");
  const suggestions = message.corrections.filter((c) => c.severity === "suggestion");
  const marked = markDiff(message.content, corrected, [...mistakes, ...typos, ...suggestions]);

  function updateCorrection(updated: ChatCorrection) {
    onUpdate({ id: message.id, corrections: message.corrections.map((c) => (c.id === updated.id ? updated : c)) });
  }

  async function improve() {
    setImproving(true);
    try {
      const update = await api<
        Pick<ChatMessage, "improvedPrompt" | "improvedPromptProvider" | "improvedPromptModel" | "improvedPromptDurationMs">
      >(
        `/api/messages/${message.id}/prompt`,
        { method: "POST" },
      );
      onUpdate({ id: message.id, ...update });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-5">
      {mistakes.length === 0 && (
        <div className="flex items-center gap-2 text-sm font-medium text-mark-right">
          <CheckCircle2 className="size-4" />
          {typos.length > 0
            ? `No mistakes, just ${typos.length === 1 ? "a typo" : `${typos.length} typos`}.`
            : corrected === message.content
              ? "Perfect! No mistakes."
              : "No mistakes."}
        </div>
      )}

      {corrected !== message.content ? (
        <DiffText from={message.content} to={corrected} segments={marked.segments} />
      ) : (
        mistakes.length + typos.length > 0 && (
          <p className="font-serif text-reading whitespace-pre-wrap">{message.content}</p>
        )
      )}

      {message.naturalText && (
        <div className="flex flex-col gap-1 border-l-2 pl-4">
          <SectionTitle icon={<MessageCircleHeart className="size-4" />}>How a native speaker would say it</SectionTitle>
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
            {(["major", "moderate", "minor"] as const).map((s) => {
              const count = mistakes.filter((e) => e.severity === s).length;
              return count > 0 ? (
                <SeverityBadge key={s} severity={s}>
                  {count}
                </SeverityBadge>
              ) : null;
            })}
          </div>
          <MistakeGroups mistakes={mistakes} numbers={marked.numbers} onUpdate={updateCorrection} />
        </section>
      )}

      {typos.length + suggestions.length > 0 && (
        <details className="group/details border-t pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open/details:rotate-90" />
            {[
              typos.length > 0 && `${typos.length} ${typos.length === 1 ? "typo" : "typos"}`,
              suggestions.length > 0 && `${suggestions.length} ${suggestions.length === 1 ? "suggestion" : "suggestions"}`,
            ]
              .filter(Boolean)
              .join(" and ")}
            <span className="font-normal">(don’t count as mistakes)</span>
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {typos.map((e) => (
              <MistakeItem key={e.id} error={e} number={marked.numbers.get(e.id)} onUpdate={updateCorrection} />
            ))}
            {suggestions.map((e) => (
              <MistakeItem key={e.id} error={e} number={marked.numbers.get(e.id)} />
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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
