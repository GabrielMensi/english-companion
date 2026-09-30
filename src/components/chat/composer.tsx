"use client";

import { Loader2, Mic, SendHorizontal, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRecorder } from "@/components/audio/use-recorder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VoiceInput } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Transcription {
  text: string;
  provider: string;
  model: string;
}

/** What was dictated into the current draft, so the message can be stored as spoken. */
type Dictation = Omit<VoiceInput, "transcriptEdited">;

export type Notify = (kind: "error" | "info", message: string) => void;

const toastNotify: Notify = (kind, message) => toast[kind](message);

/**
 * The composer's draft, dictation and recorder. It lives in `ChatView` rather than in `Composer`,
 * so the draft (and a dictation in progress) survives moving between the tab and the floating window.
 */
export function useComposer({
  onSend,
  disabled,
  notify = toastNotify,
}: {
  onSend: (text: string, voice?: VoiceInput) => Promise<boolean>;
  disabled: boolean;
  notify?: Notify;
}) {
  const [text, setText] = useState("");
  const [dictation, setDictation] = useState<Dictation | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRecorder();

  function edit(value: string) {
    setText(value);
    // Clearing the draft means starting over: it's no longer a dictated message.
    if (!value.trim()) setDictation(null);
  }

  async function submit() {
    const value = text.trim();
    if (!value || disabled || recorder.recording || transcribing) return;
    const voice = dictation
      ? { ...dictation, transcriptEdited: normalize(value) !== normalize(dictation.transcriptRaw) }
      : undefined;
    setText("");
    setDictation(null);
    // Give the text back if sending failed, so nothing is lost.
    if (!(await onSend(value, voice))) {
      setText(value);
      setDictation(dictation);
    }
  }

  async function toggleRecording() {
    if (!recorder.recording) {
      try {
        await recorder.start();
      } catch (error) {
        notify("error", `Couldn't use the microphone: ${(error as Error).message}`);
      }
      return;
    }

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
      setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken));
      setDictation((prev) => ({
        transcriptRaw: prev ? `${prev.transcriptRaw} ${spoken}` : spoken,
        transcriptionProvider: data.provider ?? "",
        transcriptionModel: data.model ?? "",
        audioDurationMs: (prev?.audioDurationMs ?? 0) + recording.durationMs,
      }));
    } catch (error) {
      notify("error", `Couldn't transcribe: ${(error as Error).message}`);
    } finally {
      setTranscribing(false);
    }
  }

  return {
    text,
    edit,
    submit,
    toggleRecording,
    cancelRecording: recorder.cancel,
    recording: recorder.recording,
    transcribing,
    disabled,
  };
}

export type ComposerState = ReturnType<typeof useComposer>;

export function Composer({ composer, canDictate }: { composer: ComposerState; canDictate: boolean }) {
  const { text, recording, transcribing, disabled } = composer;

  const placeholder = recording
    ? "Listening… click the microphone to stop, Esc to cancel"
    : transcribing
      ? "Transcribing…"
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
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            composer.submit();
          }
        }}
        placeholder={placeholder}
        // The browser's spellchecker would give away the mistakes before the tutor sees them.
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoFocus
        rows={3}
        className="max-h-60 min-h-20 resize-none"
      />
      <div className="flex flex-col gap-2">
        <Button
          onClick={composer.toggleRecording}
          disabled={!canDictate || disabled || transcribing}
          size="icon-lg"
          variant={recording ? "destructive" : "outline"}
          aria-label={recording ? "Stop dictating" : "Dictate"}
          title={
            canDictate
              ? recording
                ? "Stop and transcribe"
                : "Dictate: speak in English, your mistakes are kept"
              : "Dictation needs a Groq API key: add it in Settings"
          }
          className={cn(recording && "animate-pulse")}
        >
          {transcribing ? <Loader2 className="animate-spin" /> : recording ? <Square /> : <Mic />}
        </Button>
        <Button
          onClick={composer.submit}
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
