"use client";

import { Loader2, Mic, SendHorizontal, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { stopSpeaking } from "@/components/audio/speech";
import { PUSH_TO_TALK_KEYS, usePushToTalk } from "@/components/audio/use-push-to-talk";
import { useRecorder } from "@/components/audio/use-recorder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type FluencyMetrics, mergeFluency } from "@/lib/fluency";
import type { VoiceInput } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Transcription {
  text: string;
  provider: string;
  model: string;
  fluency: FluencyMetrics | null;
}

/** What was dictated into the current draft, so the message can be stored as spoken. */
type Dictation = Omit<VoiceInput, "transcriptEdited">;

export type Notify = (kind: "error" | "info", message: string) => void;

const toastNotify: Notify = (kind, message) => toast[kind](message);

/**
 * The composer's draft, dictation and recorder. It lives in `ChatView` rather than in `Composer`,
 * so the draft (and a dictation in progress) survives moving between the tab and the floating window.
 */
/** The message of whatever was thrown (not every rejection is an Error). */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useComposer({
  onSend,
  disabled,
  notify = toastNotify,
  canDictate = false,
  autoSend = false,
  keyWindow,
  initialText = "",
  multiline = false,
}: {
  onSend: (text: string, voice?: VoiceInput) => Promise<boolean>;
  disabled: boolean;
  notify?: Notify;
  /** Whether push-to-talk (Ctrl+Space) can start a dictation. */
  canDictate?: boolean;
  /** Voice mode: send what was dictated as soon as it's transcribed, without reviewing it. */
  autoSend?: boolean;
  /** Another window whose keys also trigger push-to-talk (the floating window). */
  keyWindow?: Window | null;
  /** A starting draft, like the numbered lines to answer an exercise set. */
  initialText?: string;
  /** Answers on several lines: Enter adds a line and Ctrl+Enter sends. */
  multiline?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [dictation, setDictation] = useState<Dictation | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRecorder();

  function edit(value: string) {
    setText(value);
    // Clearing the draft means starting over: it's no longer a dictated message.
    if (!value.trim()) setDictation(null);
  }

  async function submit() {
    if (disabled || recorder.recording || transcribing) return;
    await sendDraft(text, dictation);
  }

  async function sendDraft(draft: string, draftDictation: Dictation | null) {
    const value = draft.trim();
    if (!value) return;
    const voice = draftDictation
      ? { ...draftDictation, transcriptEdited: normalize(value) !== normalize(draftDictation.transcriptRaw) }
      : undefined;
    setText("");
    setDictation(null);
    // Give the text back if sending failed, so nothing is lost.
    const sent = await onSend(value, voice).catch((error: unknown) => {
      notify("error", `Couldn't send: ${messageOf(error)}`);
      return false;
    });
    if (!sent) {
      setText(value);
      setDictation(draftDictation);
    }
  }

  function toggleRecording() {
    return recorder.recording ? finishRecording() : startRecording();
  }

  async function startRecording() {
    // Don't record the tutor's voice along with yours.
    stopSpeaking();
    try {
      await recorder.start();
    } catch (error) {
      notify("error", `Couldn't use the microphone: ${(error as Error).message}`);
    }
  }

  async function finishRecording() {
    setTranscribing(true);
    try {
      const recording = await recorder.stop();
      if (!recording) return;
      const res = await fetch("/api/transcribe", { method: "POST", body: recording.wav });
      const data = (await res.json().catch(() => ({}))) as Partial<Transcription> & { error?: string };
      if (!res.ok || data.text === undefined) throw new Error(data.error ?? `Error ${res.status}`);
      if (!data.text) {
        notify("info", "I didn't hear anything. Try again a bit closer to the microphone.");
        return;
      }
      const spoken = data.text;
      // Dictation adds to what's already there, so you can dictate in several takes.
      const nextText = text.trim() ? `${text.trimEnd()} ${spoken}` : spoken;
      const nextDictation: Dictation = {
        transcriptRaw: dictation ? `${dictation.transcriptRaw} ${spoken}` : spoken,
        transcriptionProvider: data.provider ?? "",
        transcriptionModel: data.model ?? "",
        audioDurationMs: (dictation?.audioDurationMs ?? 0) + recording.durationMs,
        fluency: mergeFluency(dictation?.fluency ?? null, data.fluency ?? null),
      };
      if (autoSend && !disabled) {
        await sendDraft(nextText, nextDictation);
      } else {
        setText(nextText);
        setDictation(nextDictation);
      }
    } catch (error) {
      notify("error", `Couldn't transcribe: ${(error as Error).message}`);
    } finally {
      setTranscribing(false);
    }
  }

  usePushToTalk({
    enabled: canDictate && !transcribing,
    recording: recorder.recording,
    // Both catch and report their own errors.
    onStart: () => void startRecording(),
    onStop: () => void finishRecording(),
    keyWindow,
  });

  return {
    text,
    edit,
    submit,
    multiline,
    toggleRecording,
    cancelRecording: () => {
      recorder.cancel().catch((error: unknown) => notify("error", `Couldn't stop the microphone: ${messageOf(error)}`));
    },
    recording: recorder.recording,
    transcribing,
    disabled,
  };
}

export type ComposerState = ReturnType<typeof useComposer>;

export function Composer({ composer, canDictate }: { composer: ComposerState; canDictate: boolean }) {
  const { text, recording, transcribing, disabled, multiline } = composer;

  const placeholder = recording
    ? `Listening… release ${PUSH_TO_TALK_KEYS} or click the microphone to stop, Esc to cancel`
    : transcribing
      ? "Transcribing…"
      : multiline
        ? "One answer per line… (Ctrl+Enter to send)"
        : "Write in English… (Enter to send, Shift+Enter for a new line)";

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={text}
        onChange={(e) => composer.edit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && recording) {
            e.preventDefault();
            composer.cancelRecording();
          } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            // Exercise sets are answered on several lines, so Enter only sends with Ctrl (or Cmd).
            const send = multiline ? e.ctrlKey || e.metaKey : !e.shiftKey;
            if (!send) return;
            e.preventDefault();
            // submit() reports its own errors (the draft is given back if sending fails).
            void composer.submit();
          }
        }}
        placeholder={placeholder}
        // The browser's spellchecker would give away the mistakes before the tutor sees them.
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoFocus
        rows={multiline ? 7 : 3}
        className="max-h-60 min-h-20 resize-none"
      />
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void composer.toggleRecording()}
          disabled={!canDictate || disabled || transcribing}
          size="icon-lg"
          variant={recording ? "destructive" : "outline"}
          aria-label={recording ? "Stop dictating" : "Dictate"}
          title={
            canDictate
              ? recording
                ? "Stop and transcribe"
                : `Dictate (hold ${PUSH_TO_TALK_KEYS}): speak in English, your mistakes are kept`
              : "Dictation needs a Groq API key: add it in Settings"
          }
          className={cn(recording && "animate-pulse")}
        >
          {transcribing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
        </Button>
        <Button
          onClick={() => void composer.submit()}
          disabled={disabled || !text.trim() || recording || transcribing}
          size="icon-lg"
          aria-label="Send"
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
