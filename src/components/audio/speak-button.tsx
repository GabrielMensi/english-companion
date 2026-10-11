"use client";

import { Loader2, Square, Volume2 } from "lucide-react";
import { speak, stopSpeaking, useSpeaking, useSpeechPreparing, useSpeechSupported } from "@/components/audio/speech";
import { Button } from "@/components/ui/button";

/**
 * ▶ Reads the text aloud with the chosen voice; while it plays, a second click stops it. With Kokoro
 * it shows a spinner until the first audio is ready (the first time, while the model loads).
 */
export function SpeakButton({
  text,
  id = text,
  label,
}: {
  text: string;
  /** Tells apart two buttons with the same text, e.g. the reply that voice mode is reading. */
  id?: string;
  /** Shown next to the icon; without it the button is just the icon. */
  label?: string;
}) {
  const supported = useSpeechSupported();
  const speaking = useSpeaking(id);
  const preparing = useSpeechPreparing(id);
  if (!supported) return null;

  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-xs"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => (speaking ? stopSpeaking() : speak(text, id))}
      aria-label={speaking ? "Stop" : `Listen: ${text}`}
      title={preparing ? "Preparing the voice… (click to cancel)" : speaking ? "Stop" : "Listen"}
    >
      {preparing ? <Loader2 className="animate-spin" /> : speaking ? <Square /> : <Volume2 />}
      {label && (speaking ? "Stop" : label)}
    </Button>
  );
}
