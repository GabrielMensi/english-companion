"use client";

import { Lightbulb, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
  type AnswerMatch,
  type CardKind,
  checkAnswer,
  type MistakeCard,
  type QueuedCard,
  type VocabularyCard,
} from "@/lib/flashcards-core";
import { formatDelay, type Grade, GRADE_LABELS, GRADES, newReviewState, previewIntervals, type ReviewState } from "@/lib/srs";
import { categoryLabel, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const GRADE_STYLES: Record<Grade, string> = {
  again: "border-red-500/40 hover:bg-red-500/10",
  hard: "border-amber-500/40 hover:bg-amber-500/10",
  good: "border-emerald-500/40 hover:bg-emerald-500/10",
  easy: "border-sky-500/40 hover:bg-sky-500/10",
};

const MATCH_STYLES: Record<AnswerMatch, { label: string; className: string }> = {
  exact: { label: "Correct", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  close: { label: "Almost: check the spelling", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  wrong: { label: "Different from the answer", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export function ReviewSession({ kind, initialQueue }: { kind: CardKind; initialQueue: QueuedCard[] }) {
  const [queue, setQueue] = useState(initialQueue);
  const [reviewed, setReviewed] = useState(0);
  const [forgotten, setForgotten] = useState(0);
  const [typed, setTyped] = useState("");
  /** When the answer was shown (null while the question is showing); used for the button previews. */
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue[0];
  const accepted = current ? acceptedAnswers(current.card) : [];
  const match = revealedAt !== null ? checkAnswer(typed, accepted) : null;
  const previews = revealedAt !== null && current ? previewIntervals(current.state ?? newReviewState(revealedAt), revealedAt) : null;

  function reveal() {
    setRevealedAt(Date.now());
  }

  async function grade(g: Grade) {
    if (!current || saving) return;
    setSaving(true);
    try {
      const state = await api<ReviewState>("/api/flashcards/reviews", {
        body: { kind, key: current.card.key, grade: g },
      });
      setReviewed((n) => n + 1);
      if (g === "again") setForgotten((n) => n + 1);
      // A forgotten card comes back at the end of this session.
      setQueue(([, ...rest]) => (g === "again" ? [...rest, { card: current.card, state }] : rest));
      setTyped("");
      setShowHint(false);
      setRevealedAt(null);
      inputRef.current?.focus();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Keyboard: 1–4 grade the card once the answer is showing.
  const gradeRef = useRef(grade);
  useEffect(() => {
    gradeRef.current = grade;
  });
  useEffect(() => {
    if (revealedAt === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0) {
        event.preventDefault();
        void gradeRef.current(GRADES[index]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealedAt]);

  if (!current) {
    return (
      <div className="space-y-4 rounded-xl border bg-card px-6 py-12 text-center">
        {reviewed === 0 ? (
          <p className="text-muted-foreground">Nothing to review right now. Come back later!</p>
        ) : (
          <>
            <p className="text-lg font-medium">Done for now!</p>
            <p className="text-muted-foreground">
              You reviewed {reviewed} {reviewed === 1 ? "card" : "cards"}
              {forgotten > 0 && `, ${forgotten} of them again after forgetting`}.
            </p>
          </>
        )}
        <Button asChild variant="outline">
          <Link href="/flashcards">Back to flashcards</Link>
        </Button>
      </div>
    );
  }

  const card = current.card;
  const revealed = revealedAt !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {queue.length} {queue.length === 1 ? "card" : "cards"} left
          {reviewed > 0 && ` · ${reviewed} reviewed`}
        </span>
        <span>{current.state === null ? "New" : current.state.repetitions === 0 ? "Relearning" : "Review"}</span>
      </div>

      <div className="space-y-5 rounded-xl border bg-card p-6">
        {card.kind === "vocabulary" ? (
          <VocabularyFront card={card} showHint={showHint} onHint={() => setShowHint(true)} />
        ) : (
          <MistakeFront card={card} />
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!revealed) reveal();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            readOnly={revealed}
            placeholder={card.kind === "vocabulary" ? "Type it in English (optional)" : "Type the correct version (optional)"}
            aria-label="Your answer"
            autoComplete="off"
            spellCheck={false}
          />
          {!revealed && <Button type="submit">Show answer</Button>}
        </form>

        {revealed && (
          <div className="space-y-4 border-t pt-4">
            {match && (
              <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-medium", MATCH_STYLES[match].className)}>
                {MATCH_STYLES[match].label}
              </span>
            )}
            {card.kind === "vocabulary" ? <VocabularyBack card={card} /> : <MistakeBack card={card} />}
          </div>
        )}
      </div>

      {revealed && previews && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">How well did you know it? (keys 1–4)</p>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g, i) => (
              <Button
                key={g}
                variant="outline"
                disabled={saving}
                onClick={() => grade(g)}
                className={cn("h-auto flex-col gap-0 py-2", GRADE_STYLES[g])}
              >
                <span>
                  {GRADE_LABELS[g]} <span className="text-xs text-muted-foreground">{i + 1}</span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">{formatDelay(previews[g])}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function acceptedAnswers(card: VocabularyCard | MistakeCard): string[] {
  return card.kind === "vocabulary" ? card.english : [card.correction, card.fixedSentence];
}

function VocabularyFront({ card, showHint, onHint }: { card: VocabularyCard; showHint: boolean; onHint: () => void }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">How do you say…</div>
      <div className="text-2xl font-semibold">{card.spanish}</div>
      {card.hint &&
        (showHint ? (
          <p className="text-sm text-muted-foreground italic">{card.hint}</p>
        ) : (
          <Button variant="ghost" size="sm" onClick={onHint} className="-ml-2 text-muted-foreground">
            <Lightbulb /> Show the sentence you used it in
          </Button>
        ))}
    </div>
  );
}

function VocabularyBack({ card }: { card: VocabularyCard }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-xl font-medium">{card.english.join(" / ")}</span>
        <SpeakButton text={card.english.join(", ")} />
      </div>
      {card.note && <p className="text-sm text-muted-foreground">{card.note}</p>}
      {card.context && (
        <SourceSentence sessionId={card.context.sessionId}>
          <Marked text={card.context.text} terms={card.english} tone="good" />
        </SourceSentence>
      )}
    </div>
  );
}

function MistakeFront({ card }: { card: MistakeCard }) {
  const type = subtypeLabel(card.category, card.subtype);
  const tense = tenseLabel(card.tense);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>Fix the mistake</span>
        <span>·</span>
        <span>
          {categoryLabel(card.category)}
          {type && type !== "Other" && `: ${type}`}
          {tense && ` · ${tense}`}
        </span>
      </div>
      <div className="text-2xl font-semibold">{card.original}</div>
      {card.sentence !== card.original && (
        <p className="text-sm text-muted-foreground italic">
          <Marked text={card.sentence} terms={[card.original]} tone="bad" />
        </p>
      )}
    </div>
  );
}

function MistakeBack({ card }: { card: MistakeCard }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-xl font-medium text-emerald-700 dark:text-emerald-400">{card.correction}</span>
        <SpeakButton text={card.correction} />
      </div>
      <p className="text-sm">{card.explanation}</p>
      {card.fixedSentence !== card.sentence && (
        <SourceSentence sessionId={card.sessionId}>
          <Marked text={card.fixedSentence} terms={[card.correction]} tone="good" />
        </SourceSentence>
      )}
      {card.timesMade > 1 && (
        <p className="text-xs text-muted-foreground">You made this mistake {card.timesMade} times.</p>
      )}
    </div>
  );
}

function SourceSentence({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Link
        href={`/chat/${sessionId}`}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Open chat"
      >
        <MessageSquare className="size-3.5" />
      </Link>
      <span className="italic">{children}</span>
    </div>
  );
}

/** The text with the first occurrence of any term highlighted, green for answers and red for mistakes. */
function Marked({ text, terms, tone }: { text: string; terms: string[]; tone: "good" | "bad" }) {
  const lower = text.toLowerCase();
  for (const term of terms) {
    const i = term ? lower.indexOf(term.toLowerCase()) : -1;
    if (i < 0) continue;
    return (
      <>
        {text.slice(0, i)}
        <mark
          className={cn(
            "rounded-sm px-0.5",
            tone === "good"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-red-500/15 text-red-700 dark:text-red-400",
          )}
        >
          {text.slice(i, i + term.length)}
        </mark>
        {text.slice(i + term.length)}
      </>
    );
  }
  return <>{text}</>;
}
