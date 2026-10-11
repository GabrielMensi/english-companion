"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  CATEGORY_LABELS,
  ERROR_CATEGORIES,
  type ErrorCategory,
  SUBTYPES,
  type Tense,
  TENSE_CATEGORIES,
  TENSE_LABELS,
  TENSES,
} from "@/lib/taxonomy";
import type { ChatCorrection, CorrectionUpdate } from "@/lib/types";

// Radix Select items can't have an empty value.
const NONE = "none";

/** "Wrong type?": lets the learner fix a mistake's category, type and tense by hand. */
export function ClassificationDialog({
  correction,
  open,
  onOpenChange,
  onSaved,
}: {
  correction: ChatCorrection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (correction: ChatCorrection) => void;
}) {
  const [category, setCategory] = useState<ErrorCategory>(correction.category);
  const [subtype, setSubtype] = useState(correction.subtype ?? "");
  const [tense, setTense] = useState<string>(correction.tense ?? NONE);
  const [tenseUsed, setTenseUsed] = useState<string>(correction.tenseUsed ?? NONE);
  const [saving, setSaving] = useState(false);
  const hasTense = TENSE_CATEGORIES.includes(category);

  function changeCategory(value: ErrorCategory) {
    setCategory(value);
    setSubtype(Object.keys(SUBTYPES[value]).length === 1 ? Object.keys(SUBTYPES[value])[0] : "");
  }

  async function save() {
    setSaving(true);
    try {
      const { correction: updated } = await api<CorrectionUpdate>(`/api/corrections/${correction.id}`, {
        method: "PATCH",
        body: {
          category,
          subtype,
          tense: hasTense && tense !== NONE ? (tense as Tense) : null,
          tenseUsed: hasTense && tense !== NONE && tenseUsed !== NONE ? (tenseUsed as Tense) : null,
        },
      });
      onSaved(updated);
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What kind of mistake is it?</DialogTitle>
          <DialogDescription>
            “{correction.original}” → “{correction.correction}”. Your answer is final and helps measure how well the
            models classify.
          </DialogDescription>
        </DialogHeader>

        <Field label="Category">
          <Select value={category} onValueChange={(v) => changeCategory(v as ErrorCategory)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ERROR_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Type">
          <Select value={subtype} onValueChange={setSubtype}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SUBTYPES[category]).map(([key, info]) => (
                <SelectItem key={key} value={key}>
                  {info.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {hasTense && (
          <>
            <Field label="Tense the sentence needed">
              <TenseSelect value={tense} onChange={setTense} noneLabel="No specific tense" />
            </Field>
            {tense !== NONE && (
              <Field label="Tense you used">
                <TenseSelect value={tenseUsed} onChange={setTenseUsed} noneLabel="The same one (wrong form)" />
              </Field>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!subtype || saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TenseSelect({
  value,
  onChange,
  noneLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  noneLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {TENSES.map((t) => (
          <SelectItem key={t} value={t}>
            {TENSE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
