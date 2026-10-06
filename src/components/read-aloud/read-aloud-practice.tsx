"use client";

import { Loader2, Mic, RotateCcw, SkipForward, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { stopSpeaking } from "@/components/audio/speech";
import { PUSH_TO_TALK_KEYS, usePushToTalk } from "@/components/audio/use-push-to-talk";
import { useRecorder } from "@/components/audio/use-recorder";
import { Section } from "@/components/layout/page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReadAloudSource } from "@/db/schema";
import type { ReadAloudResult } from "@/lib/pronunciation-core";
import type { PronunciationSummary, ReadAloudItem } from "@/lib/read-aloud-core";
import { PRONUNCIATION_LABELS, PRONUNCIATION_TIPS, type PronunciationCategory } from "@/lib/taxonomy";

type Language = "es" | "en";

const SOURCES: { value: ReadAloudSource; label: string; empty: string }[] = [
  { value: "sounds", label: "Sounds", empty: "" },
  {
    value: "correction",
    label: "Your corrections",
    empty: "No sentences yet. The corrected versions of your messages show up here (the ones read in the last two weeks are left out).",
  },
  {
    value: "vocabulary",
    label: "Your vocabulary",
    empty: "No sentences yet. Words you look up with [brackets] show up here, in the sentence where you used them.",
  },
];

interface Transcription {
  text: string;
  provider: string;
  model: string;
}

export function ReadAloudPractice({
  items,
  initialSummary,
  initialFocus,
  canRecord,
  language,
}: {
  items: Record<ReadAloudSource, ReadAloudItem[]>;
  initialSummary: PronunciationSummary;
  /** From `?focus=`: open on the sentences for one sound. */
  initialFocus: PronunciationCategory | null;
  canRecord: boolean;
  language: Language;
}) {
  const [source, setSource] = useState<ReadAloudSource>("sounds");
  const [focus, setFocus] = useState<PronunciationCategory | null>(initialFocus);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ item: string; transcript: string; score: ReadAloudResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const recorder = useRecorder();

  const list = source === "sounds" && focus ? items.sounds.filter((i) => i.focus === focus) : items[source];
  const item = list.length > 0 ? list[index % list.length] : null;
  const shown = result && item && result.item === item.key ? result : null;
  const soundCategories = [...new Set(items.sounds.map((i) => i.focus).filter((f) => f !== null))];

  function choose(next: { source?: ReadAloudSource; focus?: PronunciationCategory | null }) {
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

  async function startRecording() {
    if (!item || busy) return;
    stopSpeaking();
    try {
      await recorder.start();
    } catch (error) {
      toast.error(`Couldn't use the microphone: ${(error as Error).message}`);
    }
  }

  async function stopRecording() {
    const current = item;
    const recording = await recorder.stop();
    if (!recording || !current) return;
    setBusy(true);
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: recording.wav });
      const heard = (await res.json().catch(() => ({}))) as Partial<Transcription> & { error?: string };
      if (!res.ok || heard.text === undefined) throw new Error(heard.error ?? `Error ${res.status}`);
      if (!heard.text) {
        toast.info("I didn't hear anything. Try again a bit closer to the microphone.");
        return;
      }
      const saved = await fetch("/api/read-aloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: current.text,
          source: current.source,
          sourceId: current.sourceId,
          focus: current.focus,
          transcript: heard.text,
          transcriptionProvider: heard.provider ?? null,
          transcriptionModel: heard.model ?? null,
          audioDurationMs: recording.durationMs,
        }),
      });
      const data = (await saved.json().catch(() => ({}))) as {
        result?: ReadAloudResult;
        summary?: PronunciationSummary;
        error?: string;
      };
      if (!saved.ok || !data.result) throw new Error(data.error ?? `Error ${saved.status}`);
      setResult({ item: current.key, transcript: heard.text, score: data.result });
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      toast.error(`Couldn't check the reading: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
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
        <Tabs value={source} onValueChange={(value) => choose({ source: value as ReadAloudSource })}>
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
              {shown ? <ScoredSentence result={shown.score} /> : <Sentence item={item} />}
              <ItemHint item={item} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => (recorder.recording ? void stopRecording() : void startRecording())}
                disabled={!canRecord || busy}
                aria-label={recorder.recording ? "Stop recording" : "Record"}
              >
                {busy ? <Loader2 className="animate-spin" /> : recorder.recording ? <Square /> : shown ? <RotateCcw /> : <Mic />}
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

function FocusButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

/** The sentence before reading it, with the word to watch underlined. */
function Sentence({ item }: { item: ReadAloudItem }) {
  if (!item.target) return <p className="font-serif text-reading">{item.text}</p>;
  const parts = item.text.split(new RegExp(`(\\b${item.target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b)`, "i"));
  return (
    <p className="font-serif text-reading">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="underline decoration-dotted decoration-2 underline-offset-4">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
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
  if (item.source === "correction") return <p className="text-sm text-muted-foreground">From one of your corrected messages.</p>;
  return null;
}

/** The sentence after reading it: words heard differently marked, with the number of their note. */
function ScoredSentence({ result }: { result: ReadAloudResult }) {
  return (
    <p className="font-serif text-reading whitespace-pre-wrap">
      {result.tokens.map((token, i) => {
        if (token.status === "wrong") {
          return (
            <span key={i} className="rounded-sm bg-mark-wrong/10 px-0.5 text-mark-wrong">
              {token.text}
              {token.issue !== null && <sup className="ml-0.5 font-sans text-xs">{token.issue + 1}</sup>}
            </span>
          );
        }
        if (token.status === "missed") {
          return (
            <span key={i} className="text-muted-foreground line-through decoration-mark-wrong" title="Not heard">
              {token.text}
            </span>
          );
        }
        return <span key={i}>{token.text}</span>;
      })}
    </p>
  );
}

function ResultDetails({ result, transcript, language }: { result: ReadAloudResult; transcript: string; language: Language }) {
  const perfect = result.issues.length === 0 && result.missedWords.length === 0;
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={perfect ? "good" : result.correctWords / result.totalWords >= 0.8 ? "warn" : "bad"}>
          {result.correctWords} of {result.totalWords} words
        </StatusBadge>
        <span className="text-muted-foreground">
          Heard: <span className="font-serif italic">{transcript}</span>
        </span>
      </div>

      {perfect && <p className="text-sm">Every word came through as written.</p>}

      {result.issues.length > 0 && (
        <ol className="space-y-3">
          {result.issues.map((issue, i) => (
            <li key={i} className="space-y-1">
              <p>
                <sup className="mr-1 text-xs text-mark-wrong">{i + 1}</sup>
                <span className="font-serif">{issue.expected}</span>{" "}
                <span className="text-muted-foreground">sounded like</span>{" "}
                <span className="font-serif text-mark-wrong">{issue.heard}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {PRONUNCIATION_LABELS[issue.category]}
                  {issue.detail && <> · {issue.detail}</>}
                </span>
              </p>
              <p className="max-w-[68ch] text-sm text-muted-foreground">{PRONUNCIATION_TIPS[issue.category][language]}</p>
            </li>
          ))}
        </ol>
      )}

      {result.missedWords.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not heard: {result.missedWords.join(", ")}. Skipped words aren’t counted as pronunciation mistakes.
        </p>
      )}
    </div>
  );
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
                  {PRONUNCIATION_LABELS[c.category]} <span className="text-sm font-normal text-muted-foreground tabular-nums">{c.count}</span>
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
