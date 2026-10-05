"use client";

import { Lightbulb, MessageSquare, MoreHorizontal, PauseCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import {
  type AnswerMatch,
  type CardKind,
  checkAnswer,
  type ExerciseCard,
  type MistakeCard,
  type QueuedCard,
  type VocabularyCard,
} from "@/lib/flashcards-core";
import { formatDelay, type Grade, GRADE_LABELS, GRADES, newReviewState, previewIntervals, type ReviewState } from "@/lib/srs";
import { categoryLabel, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const GRADE_STYLES: Record<Grade, string> = {
  again: "border-sev-major/40 hover:bg-sev-major/10",
  hard: "border-sev-minor/50 hover:bg-sev-minor/10",
  good: "border-mark-right/40 hover:bg-mark-right/10",
  easy: "border-mark-right/70 hover:bg-mark-right/15",
};

const MATCH_STYLES: Record<AnswerMatch, { label: string; className: string }> = {
  exact: { label: "Correct", className: "bg-mark-right/12 text-mark-right" },
  close: { label: "Almost: check the spelling", className: "bg-sev-minor/18 text-sev-minor-text" },
  wrong: { label: "Different from the answer", className: "bg-sev-major/12 text-sev-major-text" },
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue[0];
  const accepted = current ? acceptedAnswers(current.card) : [];
  const rawMatch = revealedAt !== null ? checkAnswer(typed, accepted) : null;
  // Exercises hinge on one small word (in / on, a / an): one letter off is a different answer, not a typo.
  const match = rawMatch === "close" && current?.card.kind === "exercise" ? "wrong" : rawMatch;
  const previews = revealedAt !== null && current ? previewIntervals(current.state ?? newReviewState(revealedAt), revealedAt) : null;

  function reveal() {
    setRevealedAt(Date.now());
  }

  function resetCard() {
    setTyped("");
    setShowHint(false);
    setRevealedAt(null);
    inputRef.current?.focus();
  }

  /** Suspends or deletes the current card and moves on to the next one. */
  async function removeCurrent(action: "suspend" | "delete") {
    if (!current || saving) return;
    setSaving(true);
    try {
      const body = { kind, key: current.card.key };
      if (action === "suspend") await api("/api/flashcards/cards", { method: "PATCH", body: { ...body, suspended: true } });
      else await api("/api/flashcards/cards", { method: "DELETE", body });
      setConfirmDelete(false);
      setQueue((q) => q.filter((c) => c.card.key !== current.card.key));
      resetCard();
      toast.success(action === "suspend" ? "Card suspended. Bring it back from the Flashcards page." : "Card deleted.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function grade(g: Grade) {
    if (!current || saving || confirmDelete) return;
    setSaving(true);
    try {
      const state = await api<ReviewState>("/api/flashcards/reviews", {
        body: { kind, key: current.card.key, grade: g },
      });
      setReviewed((n) => n + 1);
      if (g === "again") setForgotten((n) => n + 1);
      // A forgotten card comes back at the end of this session.
      setQueue(([, ...rest]) => (g === "again" ? [...rest, { card: current.card, state }] : rest));
      resetCard();
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
        <span className="flex items-center gap-1">
          {current.state === null ? "New" : current.state.repetitions === 0 ? "Relearning" : "Review"}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Card actions" disabled={saving}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => removeCurrent("suspend")}>
                <PauseCircle /> Suspend card
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> {card.kind === "vocabulary" ? "Delete word…" : card.kind === "exercise" ? "Delete exercise…" : "Delete mistake…"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {card.kind === "vocabulary"
                ? "Delete this word?"
                : card.kind === "exercise"
                  ? "Delete this exercise?"
                  : "Delete this mistake?"}
            </DialogTitle>
            <DialogDescription>
              {card.kind === "vocabulary"
                ? "Every lookup of the word is deleted, also from the Vocabulary page."
                : card.kind === "exercise"
                  ? "The missed item is deleted; the practice chat and its corrections stay. Use it for exercises that were wrong or not worth reviewing."
                  : "Its corrections are deleted from your chats and stop counting in the dashboard. Use it for corrections that were wrong."}{" "}
              To just stop reviewing it, suspend the card instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="outline" disabled={saving} onClick={() => removeCurrent("suspend")}>
              Suspend instead
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => removeCurrent("delete")}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-5 rounded-xl border bg-card p-6">
        {card.kind === "vocabulary" ? (
          <VocabularyFront card={card} showHint={showHint} onHint={() => setShowHint(true)} />
        ) : card.kind === "exercise" ? (
          <ExerciseFront card={card} />
        ) : (
          <MistakeFront card={card} showHint={showHint} onHint={() => setShowHint(true)} />
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
            placeholder={
              card.kind === "vocabulary"
                ? "Type it in English (optional)"
                : card.kind === "exercise"
                  ? "Type your answer (optional)"
                  : "Type the correct version (optional)"
            }
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
            {card.kind === "vocabulary" ? (
              <VocabularyBack card={card} />
            ) : card.kind === "exercise" ? (
              <ExerciseBack card={card} />
            ) : (
              <MistakeBack card={card} />
            )}
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

function acceptedAnswers(card: VocabularyCard | MistakeCard | ExerciseCard): string[] {
  if (card.kind === "exercise") return card.accepted;
  return card.kind === "vocabulary" ? card.english : [card.correction, card.fixedSentence];
}

function ExerciseFront({ card }: { card: ExerciseCard }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Exercise · {card.topic}</div>
      <div className="text-2xl font-semibold">{card.sentence}</div>
    </div>
  );
}

function ExerciseBack({ card }: { card: ExerciseCard }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-xl font-medium text-mark-right">{card.answer}</span>
        <SpeakButton text={card.answer} />
      </div>
      {card.why && <p className="text-sm">{card.why}</p>}
      {card.sessionId ? (
        <SourceSentence sessionId={card.sessionId}>You wrote: {card.learnerAnswer}</SourceSentence>
      ) : (
        <p className="text-sm text-muted-foreground italic">You wrote: {card.learnerAnswer}</p>
      )}
    </div>
  );
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

/** What kind of mistake it is: shown as a hint, since it can give the answer away. */
function mistakeType(card: MistakeCard): string {
  const type = subtypeLabel(card.category, card.subtype);
  const tense = tenseLabel(card.tense);
  return `${categoryLabel(card.category)}${type && type !== "Other" ? `: ${type}` : ""}${tense ? ` · ${tense}` : ""}`;
}

function MistakeFront({ card, showHint, onHint }: { card: MistakeCard; showHint: boolean; onHint: () => void }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Fix the mistake</div>
      <div className="text-2xl font-semibold">{card.original}</div>
      {card.sentence !== card.original && (
        <p className="text-sm text-muted-foreground italic">
          <Marked text={card.sentence} terms={[card.original]} tone="bad" />
        </p>
      )}
      {showHint ? (
        <p className="text-sm text-muted-foreground">Type of mistake: {mistakeType(card)}</p>
      ) : (
        <Button variant="ghost" size="sm" onClick={onHint} className="-ml-2 text-muted-foreground">
          <Lightbulb /> Show the type of mistake
        </Button>
      )}
    </div>
  );
}

function MistakeBack({ card }: { card: MistakeCard }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-xl font-medium text-mark-right">{card.correction}</span>
        <SpeakButton text={card.correction} />
      </div>
      <p className="text-sm">{card.explanation}</p>
      <p className="text-xs text-muted-foreground">{mistakeType(card)}</p>
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
              ? "bg-mark-right/12 text-mark-right"
              : "bg-sev-major/12 text-sev-major-text",
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
