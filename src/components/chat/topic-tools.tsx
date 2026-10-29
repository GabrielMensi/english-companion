"use client";

import { BookmarkPlus, ClipboardCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { TENSE_LABELS, type Tense, TENSES } from "@/lib/taxonomy";
import type { PhraseSuggestion } from "@/lib/topic-review-core";
import type { StoredFeedback } from "@/lib/topic-review";
import { voided } from "@/lib/voided";

const NO_TENSE = "none";

/** What a topic chat adds to the header: a tense to practice in it, the end-of-chat review and phrases to save. */
export function TopicTools({
  sessionId,
  tense,
  feedback,
  canReview,
}: {
  sessionId: string;
  tense: Tense | null;
  feedback: StoredFeedback | null;
  /** Whether the learner has answered enough for a review. */
  canReview: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <TenseSelect sessionId={sessionId} initial={tense} />
      <FeedbackButton sessionId={sessionId} initial={feedback} canReview={canReview} />
      <PhrasesButton sessionId={sessionId} />
    </div>
  );
}

function TenseSelect({ sessionId, initial }: { sessionId: string; initial: Tense | null }) {
  const [value, setValue] = useState<Tense | null>(initial);

  async function change(next: string) {
    const previous = value;
    const tense = next === NO_TENSE ? null : (next as Tense);
    setValue(tense);
    try {
      await api(`/api/sessions/${sessionId}`, { method: "PATCH", body: { tense } });
    } catch (error) {
      setValue(previous);
      toast.error((error as Error).message);
    }
  }

  return (
    <Select value={value ?? NO_TENSE} onValueChange={voided(change)}>
      <SelectTrigger size="sm" aria-label="Tense to practice in this chat" title="Tense to practice in this chat">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TENSE}>No tense focus</SelectItem>
        {TENSES.map((t) => (
          <SelectItem key={t} value={t}>
            {TENSE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FeedbackButton({
  sessionId,
  initial,
  canReview,
}: {
  sessionId: string;
  initial: StoredFeedback | null;
  canReview: boolean;
}) {
  const [stored, setStored] = useState(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      setStored(await api<StoredFeedback>(`/api/sessions/${sessionId}/feedback`, { method: "POST" }));
      setOpen(true);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={loading || (!stored && !canReview)}
        onClick={() => (stored ? setOpen(true) : void generate())}
        title={canReview || stored ? "Review of this conversation" : "Answer a few questions first"}
      >
        {loading ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
        Feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
            <DialogDescription>
              Based on what you wrote in this chat{stored ? ` (${stored.messages} messages)` : ""}.
            </DialogDescription>
          </DialogHeader>
          {stored && <FeedbackBody feedback={stored.feedback} />}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={voided(generate)} disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "Writing…" : "Write it again with the latest messages"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeedbackBody({ feedback }: { feedback: StoredFeedback["feedback"] }) {
  return (
    <div className="space-y-4 text-sm">
      {feedback.overall && <p>{feedback.overall}</p>}
      {feedback.strengths.length > 0 && (
        <section>
          <h3 className="font-medium">What went well</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {feedback.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {feedback.recurringMistakes.length > 0 && (
        <section>
          <h3 className="font-medium">Mistakes that came back</h3>
          <ul className="mt-1 space-y-2">
            {feedback.recurringMistakes.map((m) => (
              <li key={m.pattern}>
                {m.pattern}
                <span className="block text-muted-foreground italic">“{m.example}”</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {feedback.betterAnswers.length > 0 && (
        <section>
          <h3 className="font-medium">Stronger answers</h3>
          <ul className="mt-1 space-y-3">
            {feedback.betterAnswers.map((b) => (
              <li key={b.answer} className="space-y-1">
                <span className="block text-muted-foreground italic">You: “{b.answer}”</span>
                <span className="block">Better: “{b.better}”</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PhrasesButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<PhraseSuggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function suggest() {
    setLoading(true);
    try {
      const found = await api<PhraseSuggestion[]>(`/api/sessions/${sessionId}/phrases`, { method: "POST" });
      setSuggestions(found);
      setPicked(new Set(found.map((p) => p.phrase)));
      setOpen(true);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const phrases = (suggestions ?? []).filter((p) => picked.has(p.phrase));
    setSaving(true);
    try {
      const { added } = await api<{ added: number }>(`/api/sessions/${sessionId}/phrases`, {
        method: "PUT",
        body: { phrases },
      });
      toast.success(added === 1 ? "Saved 1 phrase to Vocabulary" : `Saved ${added} phrases to Vocabulary`);
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggle(phrase: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(phrase)) next.add(phrase);
      return next;
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={voided(suggest)}
        title="Pick useful phrases from this chat to save"
      >
        {loading ? <Loader2 className="animate-spin" /> : <BookmarkPlus />}
        Phrases
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Phrases from this chat</DialogTitle>
            <DialogDescription>
              Expressions from the tutor’s replies and the native versions of your messages. Pick the ones to save to
              Vocabulary.
            </DialogDescription>
          </DialogHeader>
          {suggestions?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing new to save from this chat yet.</p>
          ) : (
            <ul className="space-y-2">
              {(suggestions ?? []).map((p) => (
                <li key={p.phrase}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.has(p.phrase)}
                      onChange={() => toggle(p.phrase)}
                    />
                    <span>
                      <span className="block font-medium">{p.phrase}</span>
                      <span className="block text-muted-foreground">{p.spanish}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={voided(save)} disabled={saving || picked.size === 0 || !suggestions?.length}>
              {saving && <Loader2 className="animate-spin" />}
              Save {picked.size > 0 ? picked.size : ""} to Vocabulary
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
