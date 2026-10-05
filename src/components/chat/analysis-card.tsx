"use client";

import { ArrowRight, BookOpen, CheckCircle2, Lightbulb, Loader2, MessageCircleHeart, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { ClassificationDialog } from "@/components/chat/classification-dialog";
import { DiffText } from "@/components/chat/diff-text";
import { ModelNote } from "@/components/chat/model-note";
import { CopyButton } from "@/components/copy-button";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { categoryLabel, SEVERITIES, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
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
  const errors = message.corrections.filter((c) => c.severity !== "suggestion");
  const suggestions = message.corrections.filter((c) => c.severity === "suggestion");
  const perfect = errors.length === 0;

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
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      {perfect ? (
        <div className="flex items-center gap-2 text-sm font-medium text-mark-right">
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

      {corrected !== message.content && <DiffText from={message.content} to={corrected} />}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-3">
          {errors.map((e) => (
            <ErrorItem key={e.id} error={e} onUpdate={updateCorrection} />
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <Section icon={<Lightbulb className="size-4" />} title="Suggestions (optional, not mistakes)">
          <ul className="flex flex-col gap-2">
            {suggestions.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{e.original}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{e.correction}</span>
                </div>
                <p className="text-muted-foreground">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {message.naturalText && (
        <Section icon={<MessageCircleHeart className="size-4" />} title="How a native speaker would say it">
          <div className="flex items-start gap-1">
            <p className="flex-1 font-serif text-reading whitespace-pre-wrap">{message.naturalText}</p>
            <SpeakButton text={message.naturalText} />
          </div>
        </Section>
      )}

      {message.vocabulary.length > 0 && (
        <Section icon={<BookOpen className="size-4" />} title="Vocabulary">
          <ul className="flex flex-col gap-1.5 text-sm">
            {message.vocabulary.map((v) => (
              <li key={v.id}>
                <span className="text-muted-foreground">{v.spanish}</span> →{" "}
                <span className="font-medium">{v.english.join(" / ")}</span>{" "}
                <span className="inline-block align-middle">
                  <SpeakButton text={v.english.join(", ")} />
                </span>
                {v.note && <span className="text-muted-foreground"> — {v.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {message.improvedPrompt && (
        <Section icon={<Sparkles className="size-4" />} title="Improved prompt">
          <pre className="rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {message.improvedPrompt}
          </pre>
          <ModelNote
            verb="Generated by"
            provider={message.improvedPromptProvider}
            model={message.improvedPromptModel}
            durationMs={message.improvedPromptDurationMs}
          />
        </Section>
      )}

      <ModelNote
        verb="Corrected by"
        provider={message.provider}
        model={message.model}
        durationMs={message.durationMs}
        fallbackAttempts={message.fallbackAttempts}
      />

      <div className="-mb-1 flex flex-wrap gap-1 border-t pt-2">
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
      </div>
    </div>
  );
}

function ErrorItem({ error: e, onUpdate }: { error: ChatCorrection; onUpdate: (c: ChatCorrection) => void }) {
  const [editing, setEditing] = useState(false);
  const subtype = subtypeLabel(e.category, e.subtype);
  const tense = tenseLabel(e.tense);
  const tenseUsed = tenseLabel(e.tenseUsed);

  return (
    <li className="group flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={e.severity} />
        <span className="text-mark-wrong line-through">{e.original}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-mark-right">{e.correction}</span>
        <span className="text-xs text-muted-foreground">
          · {categoryLabel(e.category)}
          {subtype && ` › ${subtype}`}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setEditing(true)}
        >
          Wrong type?
        </Button>
      </div>
      {tense && (
        <p className="text-xs text-muted-foreground">
          {tenseUsed ? `${tenseUsed} used instead of ${tense.toLowerCase()}` : tense}
        </p>
      )}
      <p className="text-muted-foreground">{e.explanation}</p>
      {editing && <ClassificationDialog correction={e} open={editing} onOpenChange={setEditing} onSaved={onUpdate} />}
    </li>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
