"use client";

import { Lightbulb, MessageSquare } from "lucide-react";
import Link from "next/link";
import { SpeakButton } from "@/components/audio/speak-button";
import { type Language, ResultDetails, ScoredSentence, TargetSentence } from "@/components/read-aloud/reading-result";
import { type ReadingOutcome } from "@/components/read-aloud/use-read-aloud";
import { Button } from "@/components/ui/button";
import {
  type ExerciseCard,
  type MistakeCard,
  type PronunciationCard,
  type VocabularyCard,
} from "@/lib/flashcards-core";
import { categoryLabel, PRONUNCIATION_LABELS, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export function PronunciationFront({
  card,
  reading,
  showHint,
  onHint,
}: {
  card: PronunciationCard;
  reading: ReadingOutcome | null;
  showHint: boolean;
  onHint: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Read it aloud</div>
      {reading ? (
        <ScoredSentence result={reading.score} />
      ) : (
        <TargetSentence text={card.text} targets={card.words.map((w) => w.expected)} />
      )}
      {!reading &&
        (showHint ? (
          <p className="text-sm text-muted-foreground">
            Last time: <HeardList words={card.words} />
          </p>
        ) : (
          <Button variant="ghost" size="sm" onClick={onHint} className="-ml-2 text-muted-foreground">
            <Lightbulb /> Show what it sounded like
          </Button>
        ))}
    </div>
  );
}

export function PronunciationBack({
  card,
  reading,
  language,
}: {
  card: PronunciationCard;
  reading: ReadingOutcome | null;
  language: Language;
}) {
  return (
    <div className="space-y-3">
      {reading ? (
        <ResultDetails result={reading.score} transcript={reading.transcript} language={language} />
      ) : (
        <>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Listen to it and compare:</span>
            <SpeakButton text={card.text} />
          </div>
          <ul className="space-y-1 text-sm">
            {card.words.map((w) => (
              <li key={`${w.expected}|${w.heard}`}>
                <span className="font-serif">{w.expected}</span>{" "}
                <span className="text-muted-foreground">sounded like</span>{" "}
                <span className="font-serif text-mark-wrong">{w.heard}</span>
                <span className="ml-2 text-muted-foreground">
                  {PRONUNCIATION_LABELS[w.category]}
                  {w.detail && <> · {w.detail}</>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {card.timesMissed > 1 && (
        <p className="text-xs text-muted-foreground">Words were heard differently in {card.timesMissed} readings.</p>
      )}
    </div>
  );
}

function HeardList({ words }: { words: PronunciationCard["words"] }) {
  return (
    <>
      {words.map((w, i) => (
        <span key={`${w.expected}|${w.heard}`}>
          {i > 0 && ", "}
          <span className="font-serif">{w.expected}</span> sounded like{" "}
          <span className="font-serif text-mark-wrong">{w.heard}</span>
        </span>
      ))}
    </>
  );
}

export function acceptedAnswers(card: VocabularyCard | MistakeCard | ExerciseCard): string[] {
  if (card.kind === "exercise") return card.accepted;
  return card.kind === "vocabulary" ? card.english : [card.correction, card.fixedSentence];
}

export function ExerciseFront({ card }: { card: ExerciseCard }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Exercise · {card.topic}</div>
      <div className="text-2xl font-semibold">{card.sentence}</div>
    </div>
  );
}

export function ExerciseBack({ card }: { card: ExerciseCard }) {
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

export function VocabularyFront({
  card,
  showHint,
  onHint,
}: {
  card: VocabularyCard;
  showHint: boolean;
  onHint: () => void;
}) {
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

export function VocabularyBack({ card }: { card: VocabularyCard }) {
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

export function MistakeFront({ card, showHint, onHint }: { card: MistakeCard; showHint: boolean; onHint: () => void }) {
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

export function MistakeBack({ card }: { card: MistakeCard }) {
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
            tone === "good" ? "bg-mark-right/12 text-mark-right" : "bg-sev-major/12 text-sev-major-text",
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
