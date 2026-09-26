"use client";

import { ArrowRight, BookOpen, CheckCircle2, Loader2, MessageCircleHeart, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DiffText } from "@/components/chat/diff-text";
import { CopyButton } from "@/components/copy-button";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { categoryLabel, SEVERITIES } from "@/lib/taxonomy";
import type { ChatMessage } from "@/lib/types";

export function AnalysisCard({
  message,
  onUpdate,
}: {
  message: ChatMessage;
  onUpdate: (message: Partial<ChatMessage> & { id: string }) => void;
}) {
  const [improving, setImproving] = useState(false);
  const corrected = message.correctedText ?? message.content;
  const errors = message.corrections;
  const perfect = errors.length === 0;

  async function improve() {
    setImproving(true);
    try {
      const { improvedPrompt } = await api<{ improvedPrompt: string }>(`/api/messages/${message.id}/prompt`, {
        method: "POST",
      });
      onUpdate({ id: message.id, improvedPrompt });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      {perfect ? (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {corrected === message.content ? "Perfect! No mistakes." : "Sin errores."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {SEVERITIES.map((s) => {
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
            <li key={e.id} className="flex flex-col gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={e.severity} />
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

      {message.naturalText && (
        <Section icon={<MessageCircleHeart className="size-4" />} title="Cómo lo diría un nativo">
          <p className="leading-relaxed whitespace-pre-wrap">{message.naturalText}</p>
        </Section>
      )}

      {message.vocabulary.length > 0 && (
        <Section icon={<BookOpen className="size-4" />} title="Vocabulario">
          <ul className="flex flex-col gap-1.5 text-sm">
            {message.vocabulary.map((v) => (
              <li key={v.id}>
                <span className="text-muted-foreground">{v.spanish}</span> →{" "}
                <span className="font-medium">{v.english.join(" / ")}</span>
                {v.note && <span className="text-muted-foreground"> — {v.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {message.improvedPrompt && (
        <Section icon={<Sparkles className="size-4" />} title="Prompt mejorado">
          <pre className="rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {message.improvedPrompt}
          </pre>
        </Section>
      )}

      <div className="-mb-1 flex flex-wrap gap-1 border-t pt-2">
        <CopyButton text={corrected} label="Copiar corregido" />
        {message.improvedPrompt ? (
          <>
            <CopyButton text={message.improvedPrompt} label="Copiar prompt" />
            <Button variant="ghost" size="sm" onClick={improve} disabled={improving}>
              {improving ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Regenerar prompt
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={improve} disabled={improving}>
            {improving ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Convertir en prompt
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
