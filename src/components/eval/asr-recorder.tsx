"use client";

import { CheckCircle2, Circle, Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { encodeWav, resample, SPEECH_SAMPLE_RATE, toMono } from "@/lib/audio/wav";
import type { AsrSample } from "@/lib/eval/asr-samples";
import { cn } from "@/lib/utils";

type Phase = { id: string; step: "recording" | "saving" } | null;

/** Records each eval sentence in the browser and saves it as 16 kHz mono WAV. */
export function AsrRecorder({ samples, initialRecorded }: { samples: AsrSample[]; initialRecorded: string[] }) {
  const [recorded, setRecorded] = useState(() => new Set(initialRecorded));
  // Bumped after each save so the <audio> reloads the new take.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Phase>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  async function start(id: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (e) => chunks.push(e.data);
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void save(id, new Blob(chunks, { type: media.mimeType }));
      };
      recorder.current = media;
      media.start();
      setPhase({ id, step: "recording" });
    } catch (error) {
      toast.error(`Couldn't use the microphone: ${(error as Error).message}`);
    }
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
  }

  async function save(id: string, blob: Blob) {
    setPhase({ id, step: "saving" });
    try {
      const context = new AudioContext();
      const audio = await context.decodeAudioData(await blob.arrayBuffer());
      await context.close();
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
      const wav = encodeWav(resample(toMono(channels), audio.sampleRate, SPEECH_SAMPLE_RATE), SPEECH_SAMPLE_RATE);

      const res = await fetch(`/api/eval/asr-samples/${id}`, { method: "PUT", body: wav });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      setRecorded((prev) => new Set(prev).add(id));
      setVersions((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    } catch (error) {
      toast.error(`Couldn't save the recording: ${(error as Error).message}`);
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {recorded.size} of {samples.length} recorded.
      </p>
      <ol className="divide-y rounded-xl border bg-card">
        {samples.map((s) => {
          const active = phase?.id === s.id;
          const busy = phase !== null && !active;
          return (
            <li key={s.id} className={cn("flex flex-col gap-2 p-4", active && "bg-muted/40")}>
              <div className="flex items-start gap-3">
                {recorded.has(s.id) ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Recorded" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not recorded" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="leading-relaxed">{highlight(s.text, s.mistake)}</p>
                </div>
                {active && phase.step === "recording" ? (
                  <Button size="sm" variant="destructive" onClick={stop}>
                    <Square /> Stop
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => start(s.id)} disabled={busy || active}>
                    {active ? <Loader2 className="animate-spin" /> : <Mic />}
                    {recorded.has(s.id) ? "Record again" : "Record"}
                  </Button>
                )}
              </div>
              {recorded.has(s.id) && (
                <audio
                  controls
                  preload="none"
                  src={`/api/eval/asr-samples/${s.id}?v=${versions[s.id] ?? 0}`}
                  className="h-8 w-full"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Underlines the mistake so it's read on purpose, not corrected on the fly. */
function highlight(text: string, mistake: string) {
  const at = text.toLowerCase().indexOf(mistake.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="underline decoration-red-500/70 decoration-wavy underline-offset-4">
        {text.slice(at, at + mistake.length)}
      </span>
      {text.slice(at + mistake.length)}
    </>
  );
}
