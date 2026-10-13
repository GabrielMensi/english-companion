"use client";

import { Loader2, Mic, RotateCcw, SkipForward, Square } from "lucide-react";
import { useState } from "react";
import { SpeakButton } from "@/components/audio/speak-button";
import { PUSH_TO_TALK_KEYS, usePushToTalk } from "@/components/audio/use-push-to-talk";
import { Section } from "@/components/layout/page";
import { type Language, ResultDetails, ScoredSentence, TargetSentence } from "@/components/read-aloud/reading-result";
import { useReadAloud } from "@/components/read-aloud/use-read-aloud";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReadAloudSource } from "@/db/schema";
import type { ReadAloudResult } from "@/lib/pronunciation-core";
import type { PronunciationSummary, ReadAloudItem } from "@/lib/read-aloud-core";
import { PRONUNCIATION_LABELS, type PronunciationCategory } from "@/lib/taxonomy";

/** The Read aloud page's tabs (the "review" source is the flashcard deck). */
type PageSource = Exclude<ReadAloudSource, "review">;

const SOURCES: { value: PageSource; label: string; empty: string }[] = [
  { value: "sounds", label: "Sounds", empty: "" },
  {
    value: "correction",
    label: "Your corrections",
    empty:
      "No sentences yet. The corrected versions of your messages show up here (the ones read in the last two weeks are left out).",
  },
  {
    value: "vocabulary",
    label: "Your vocabulary",
    empty: "No sentences yet. Words you look up with [brackets] show up here, in the sentence where you used them.",
  },
];

export function ReadAloudPractice({
  items,
  initialSummary,
  initialFocus,
  canRecord,
  language,
}: {
  items: Record<PageSource, ReadAloudItem[]>;
  initialSummary: PronunciationSummary;
  /** From `?focus=`: open on the sentences for one sound. */
  initialFocus: PronunciationCategory | null;
  canRecord: boolean;
  language: Language;
}) {
  const [source, setSource] = useState<PageSource>("sounds");
  const [focus, setFocus] = useState<PronunciationCategory | null>(initialFocus);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ item: string; transcript: string; score: ReadAloudResult } | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const recorder = useReadAloud();
  const busy = recorder.busy;

  const list = source === "sounds" && focus ? items.sounds.filter((i) => i.focus === focus) : items[source];
  const item = list.length > 0 ? list[index % list.length] : null;
  const shown = result && item && result.item === item.key ? result : null;
  const soundCategories = [...new Set(items.sounds.map((i) => i.focus).filter((f) => f !== null))];

  function choose(next: { source?: PageSource; focus?: PronunciationCategory | null }) {
    if (recorder.recording) void recorder.cancel();
    if (next.source) setSource(next.source);
    if (next.focus !== undefined) {
      setFocus(next.focus);
      // Keep ?focus= in sync, so reloading or sharing the link opens the same sound.
      const url = new URL(window.location.href);
      if (next.focus) url.searchParams.set("focus", next.focus);
      else url.searchParams.delete("focus");
      window.history.replaceState(window.history.state, "", url);
    }
    setIndex(0);
    setResult(null);
  }

  function nextItem() {
    if (recorder.recording) void recorder.cancel();
    setIndex((i) => i + 1);
    setResult(null);
  }

  function startRecording() {
    if (item) void recorder.start();
  }

  async function stopRecording() {
    if (!item) return;
    const current = item;
    const outcome = await recorder.stop(current);
    if (!outcome) return;
    setResult({ item: current.key, transcript: outcome.transcript, score: outcome.score });
    if (outcome.summary) setSummary(outcome.summary);
  }

  usePushToTalk({
    enabled: canRecord && !busy && item !== null,
    recording: recorder.recording,
    onStart: () => void startRecording(),
    onStop: () => void stopRecording(),
  });

  return (
    <>
      <Section
        title="Read this aloud"
        description={
          canRecord
            ? `Read the sentence at your normal pace. Click the microphone, or hold ${PUSH_TO_TALK_KEYS}.`
            : "Reading aloud needs speech-to-text: add a Groq API key in Settings."
        }
      >
        <Tabs value={source} onValueChange={(value) => choose({ source: value as PageSource })}>
          <TabsList>
            {SOURCES.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {source === "sounds" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sound to practice">
            <FocusButton active={focus === null} onClick={() => choose({ focus: null })}>
              All sounds
            </FocusButton>
            {soundCategories.map((category) => (
              <FocusButton key={category} active={focus === category} onClick={() => choose({ focus: category })}>
                {PRONUNCIATION_LABELS[category]}
              </FocusButton>
            ))}
          </div>
        )}

        {item ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {shown ? (
                <ScoredSentence result={shown.score} />
              ) : (
                <TargetSentence text={item.text} targets={item.target ? [item.target] : []} />
              )}
              <ItemHint item={item} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => (recorder.recording ? void stopRecording() : void startRecording())}
                disabled={!canRecord || busy}
                aria-label={recorder.recording ? "Stop recording" : "Record"}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : recorder.recording ? (
                  <Square />
                ) : shown ? (
                  <RotateCcw />
                ) : (
                  <Mic />
                )}
                {busy ? "Checking…" : recorder.recording ? "Stop" : shown ? "Try again" : "Record"}
              </Button>
              <SpeakButton text={item.text} label="Listen" />
              <Button variant="ghost" size="sm" onClick={nextItem} disabled={busy || list.length < 2}>
                <SkipForward /> Next
              </Button>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {(index % list.length) + 1} of {list.length}
              </span>
            </div>

            {shown && <ResultDetails result={shown.score} transcript={shown.transcript} language={language} />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{SOURCES.find((s) => s.value === source)?.empty}</p>
        )}
      </Section>

      <SoundsToWorkOn
        summary={summary}
        onPractice={(category) => choose({ source: "sounds", focus: category })}
        canPractice={(category) => soundCategories.includes(category)}
      />
    </>
  );
}

function FocusButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

function ItemHint({ item }: { item: ReadAloudItem }) {
  if (item.source === "sounds" && item.focus && item.target && item.confusedWith) {
    return (
      <p className="text-sm text-muted-foreground">
        {PRONUNCIATION_LABELS[item.focus]}: make <i>{item.target}</i> sound different from <i>{item.confusedWith}</i>.
      </p>
    );
  }
  if (item.source === "vocabulary" && item.target) {
    return <p className="text-sm text-muted-foreground">You looked up “{item.target}”.</p>;
  }
  if (item.source === "correction")
    return <p className="text-sm text-muted-foreground">From one of your corrected messages.</p>;
  return null;
}

function SoundsToWorkOn({
  summary,
  onPractice,
  canPractice,
}: {
  summary: PronunciationSummary;
  onPractice: (category: PronunciationCategory) => void;
  canPractice: (category: PronunciationCategory) => boolean;
}) {
  return (
    <Section
      title="Sounds to work on"
      description={
        summary.attempts > 0
          ? `Last 30 days: ${summary.attempts} ${summary.attempts === 1 ? "reading" : "readings"}, ${Math.round((summary.accuracy ?? 0) * 100)}% of the words heard as written.`
          : "Read a few sentences and the sounds that speech-to-text hears differently show up here."
      }
    >
      {summary.categories.length > 0 ? (
        <ul className="divide-y">
          {summary.categories.map((c) => (
            <li key={c.category} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {PRONUNCIATION_LABELS[c.category]}{" "}
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">{c.count}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {c.examples.map((e, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span className="font-serif">{e.expected}</span> as{" "}
                      <span className="font-serif text-mark-wrong">{e.heard}</span>
                      {e.count > 1 && <span className="tabular-nums"> ({e.count})</span>}
                    </span>
                  ))}
                </p>
              </div>
              {canPractice(c.category) && (
                <Button variant="outline" size="sm" onClick={() => onPractice(c.category)}>
                  Practice
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        summary.attempts > 0 && <p className="text-sm">No sounds heard differently yet.</p>
      )}
    </Section>
  );
}
