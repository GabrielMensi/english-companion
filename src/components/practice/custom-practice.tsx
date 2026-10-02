"use client";

import { useState } from "react";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Tense, TENSE_LABELS, TENSES } from "@/lib/taxonomy";
import type { ExerciseKind } from "@/lib/tense-practice";

const KIND_LABELS: Record<ExerciseKind | "conversation", string> = {
  contrast: "Contrast exercise",
  form: "Form drill",
  use: "Use it in sentences",
  conversation: "Conversation",
};

/** Practice any tense, not only the ones the diagnosis picked. */
export function CustomPractice() {
  const [tense, setTense] = useState<Tense>("present_perfect");
  const [kind, setKind] = useState<ExerciseKind | "conversation">("contrast");
  const [contrastWith, setContrastWith] = useState<Tense>("past_simple");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Tense">
        <Select value={tense} onValueChange={(v) => setTense(v as Tense)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TENSES.map((t) => (
              <SelectItem key={t} value={t}>
                {TENSE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Practice">
        <Select value={kind} onValueChange={(v) => setKind(v as ExerciseKind | "conversation")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as (ExerciseKind | "conversation")[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {kind === "contrast" && (
        <Field label="Versus">
          <Select value={contrastWith} onValueChange={(v) => setContrastWith(v as Tense)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TENSES.filter((t) => t !== tense).map((t) => (
                <SelectItem key={t} value={t}>
                  {TENSE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <StartPracticeButton
        request={{ kind, tense, contrastWith: kind === "contrast" ? contrastWith : null }}
        disabled={kind === "contrast" && contrastWith === tense}
      >
        Start
      </StartPracticeButton>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
