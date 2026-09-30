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

export function Composer({
  onSend,
  disabled,
  canDictate,
}: {
  onSend: (text: string, voice?: VoiceInput) => Promise<boolean>;
  disabled: boolean;
  canDictate: boolean;
}) {
  const [text, setText] = useState("");
  const [dictation, setDictation] = useState<Dictation | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRecorder();

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
        toast.error(`Couldn't use the microphone: ${(error as Error).message}`);
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
        toast.info("I didn't hear anything. Try again a bit closer to the microphone.");
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
      toast.error(`Couldn't transcribe: ${(error as Error).message}`);
    } finally {
      setTranscribing(false);
    }
  }

  const placeholder = recorder.recording
    ? "Listening… click the microphone to stop, Esc to cancel"
    : transcribing
      ? "Transcribing…"
      : "Write in English… (Enter to send, Shift+Enter for a new line)";

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // Clearing the draft means starting over: it's no longer a dictated message.
          if (!e.target.value.trim()) setDictation(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && recorder.recording) {
            e.preventDefault();
            recorder.cancel();
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
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
          onClick={toggleRecording}
          disabled={!canDictate || disabled || transcribing}
          size="icon-lg"
          variant={recorder.recording ? "destructive" : "outline"}
          aria-label={recorder.recording ? "Stop dictating" : "Dictate"}
          title={
            canDictate
              ? recorder.recording
                ? "Stop and transcribe"
                : "Dictate: speak in English, your mistakes are kept"
              : "Dictation needs a Groq API key: add it in Settings"
          }
          className={cn(recorder.recording && "animate-pulse")}
        >
          {transcribing ? <Loader2 className="animate-spin" /> : recorder.recording ? <Square /> : <Mic />}
        </Button>
        <Button
          onClick={submit}
          disabled={disabled || !text.trim() || recorder.recording || transcribing}
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
