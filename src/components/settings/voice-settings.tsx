"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";
import {
  getSpeechPrefs,
  saveSpeechPrefs,
  type SpeechPrefs,
  speak,
  useEnglishVoices,
  useSpeechSupported,
} from "@/components/audio/speech";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AUTO = "auto";
const RATES = [0.75, 0.9, 1, 1.1, 1.25];
const SAMPLE = "I've been learning English for a while, and I'm getting better at it.";

/** Voice and speed for ▶ buttons and voice mode. Saved in this browser, since each browser has its own voices. */
export function VoiceSettings() {
  const supported = useSpeechSupported();
  const voices = useEnglishVoices();
  const [prefs, setPrefs] = useState<SpeechPrefs | null>(null);
  // Also false during server rendering, so the section appears once the page loads.
  if (!supported) return null;

  // Read lazily: localStorage doesn't exist while rendering on the server.
  const current = prefs ?? getSpeechPrefs();
  function update(patch: Partial<SpeechPrefs>) {
    const next = { ...current, ...patch };
    setPrefs(next);
    saveSpeechPrefs(next);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-medium">Listening</h2>
        <p className="text-sm text-muted-foreground">
          The voice that reads corrections, vocabulary and replies in voice mode. Saved in this browser. In Edge, the
          “Natural” voices sound the most human.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>Voice</Label>
        <Select
          value={voices.some((v) => v.voiceURI === current.voice) ? current.voice! : AUTO}
          onValueChange={(v) => update({ voice: v === AUTO ? null : v })}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>Automatic{voices[0] ? ` (${voices[0].name})` : ""}</SelectItem>
            {voices.map((v) => (
              <SelectItem key={v.voiceURI} value={v.voiceURI}>
                {v.name} · {v.lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>Speed</Label>
        <div className="flex items-center gap-2">
          <Select value={String(current.rate)} onValueChange={(v) => update({ rate: Number(v) })}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATES.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r === 1 ? "Normal" : `${r}×`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => speak(SAMPLE)}>
            <Volume2 /> Try it
          </Button>
        </div>
      </div>
    </section>
  );
}
