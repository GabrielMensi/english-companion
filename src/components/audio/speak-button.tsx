"use client";

import { Square, Volume2 } from "lucide-react";
import { speak, stopSpeaking, useSpeaking, useSpeechSupported } from "@/components/audio/speech";
import { Button } from "@/components/ui/button";

/** ▶ Reads the text aloud with the browser's voice; while it plays, a second click stops it. */
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
  if (!supported) return null;

  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-xs"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => (speaking ? stopSpeaking() : speak(text, id))}
      aria-label={speaking ? "Stop" : `Listen: ${text}`}
      title={speaking ? "Stop" : "Listen"}
    >
      {speaking ? <Square /> : <Volume2 />}
      {label && (speaking ? "Stop" : label)}
    </Button>
  );
}
