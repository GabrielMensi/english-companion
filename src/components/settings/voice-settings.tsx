"use client";

import { Loader2, Volume2 } from "lucide-react";
import { useState } from "react";
import {
  getGpuRejection,
  type KokoroDevice,
  type KokoroDtype,
  type KokoroStatus,
  kokoroSupported,
  retryKokoroGpu,
  useKokoroStatus,
} from "@/components/audio/kokoro";
import {
  getSpeechPrefs,
  preloadSpeech,
  retryKokoro,
  saveSpeechPrefs,
  type SpeechPrefs,
  speak,
  useEnglishVoices,
  useSpeechPreparing,
  useSpeechSupported,
} from "@/components/audio/speech";
import { KOKORO_VOICES, type KokoroDevicePref, type SpeechEngine } from "@/components/audio/speech-prefs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AUTO = "auto";
const RATES = [0.75, 0.9, 1, 1.1, 1.25];
const SAMPLE = "I've been learning English for a while, and I'm getting better at it.";

/**
 * Voice engine, voice and speed for ▶ buttons, voice mode and the floating window. Saved in this
 * browser, since each browser has its own voices (and its own copy of the Kokoro model).
 */
export function VoiceSettings() {
  const supported = useSpeechSupported();
  const voices = useEnglishVoices();
  const kokoro = useKokoroStatus();
  const trying = useSpeechPreparing(SAMPLE);
  const [prefs, setPrefs] = useState<SpeechPrefs | null>(null);
  // Also false during server rendering, so the section appears once the page loads.
  if (!supported) return null;

  // Read lazily: localStorage doesn't exist while rendering on the server.
  const current = prefs ?? getSpeechPrefs();
  function update(patch: Partial<SpeechPrefs>) {
    const next = { ...current, ...patch };
    setPrefs(next);
    saveSpeechPrefs(next);
    // Picking Kokoro (or another device for it) starts loading the model, so it's ready by the time it's needed.
    if (patch.engine === "kokoro" || patch.kokoroDevice) preloadSpeech();
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-medium">Listening</h2>
        <p className="text-sm text-muted-foreground">
          The voice that reads corrections, vocabulary and replies in voice mode. Saved in this browser. In Edge, the
          browser’s “Natural” voices sound the most human; Kokoro is a free model that runs on your computer.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>Engine</Label>
        <Select value={current.engine} onValueChange={(v) => update({ engine: v as SpeechEngine })}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="browser">Browser voice</SelectItem>
            {kokoroSupported() && <SelectItem value="kokoro">Kokoro (local model)</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {current.engine === "kokoro" ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <Label>Voice</Label>
            <Select value={current.kokoroVoice} onValueChange={(v) => update({ kokoroVoice: v })}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KOKORO_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {v.accent} {v.gender.toLowerCase()} · {v.grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>Device</Label>
            <Select
              value={current.kokoroDevice}
              onValueChange={(v) => update({ kokoroDevice: v as KokoroDevicePref })}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (GPU if its audio checks out)</SelectItem>
                <SelectItem value="webgpu">GPU (WebGPU)</SelectItem>
                <SelectItem value="wasm">CPU (WebAssembly)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <KokoroStatusLine status={kokoro} devicePref={current.kokoroDevice} />
        </>
      ) : (
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
      )}
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
          <Button variant="outline" size="sm" onClick={() => speak(SAMPLE)} disabled={trying}>
            {trying ? <Loader2 className="animate-spin" /> : <Volume2 />} Try it
          </Button>
        </div>
      </div>
    </section>
  );
}

const DEVICE_LABEL: Record<KokoroDevice, string> = { webgpu: "GPU (WebGPU)", wasm: "CPU (WebAssembly)" };

function deviceLabel(device: KokoroDevice, dtype: KokoroDtype) {
  return `${DEVICE_LABEL[device]}, ${dtype}`;
}

function KokoroStatusLine({ status, devicePref }: { status: KokoroStatus; devicePref: KokoroDevicePref }) {
  let text: string;
  switch (status.state) {
    case "idle":
      text =
        "The model downloads the first time it’s used (about 330 MB for the GPU, 90 MB for the CPU) and stays cached in this browser.";
      break;
    case "loading": {
      const where = status.device && status.dtype ? ` on the ${deviceLabel(status.device, status.dtype)}` : "";
      text =
        status.progress === null
          ? `Loading the model${where}…`
          : `Downloading the model${where}… ${Math.round(status.progress * 100)}% (only the first time)`;
      break;
    }
    case "ready":
      text = `Ready, running on the ${deviceLabel(status.device, status.dtype)}${status.adapter ? ` · ${status.adapter}` : ""}.`;
      break;
    case "error":
      text = `Couldn’t load the model (${status.message}). The browser voice reads instead.`;
      break;
  }
  // Read on every render (it changes along with the status): set when the GPU's audio failed the check.
  const rejection = devicePref === "auto" ? getGpuRejection() : null;
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2">
          {status.state === "loading" && <Loader2 className="size-4 shrink-0 animate-spin" />}
          {text}
        </p>
        {status.state === "error" && (
          <Button variant="outline" size="sm" onClick={retryKokoro}>
            Retry
          </Button>
        )}
      </div>
      {/* With a remembered rejection, the line below already says why the CPU is in use. */}
      {status.state === "ready" && status.warning && !rejection && (
        <p className="text-amber-700 dark:text-amber-400">{status.warning}</p>
      )}
      {rejection && status.state !== "loading" && (
        <div className="flex items-center justify-between gap-4">
          <p>
            The GPU’s audio failed the check on {new Date(rejection.at).toLocaleDateString()} ({rejection.reason}), so
            Auto uses the CPU in this browser.
          </p>
          <Button variant="outline" size="sm" onClick={() => retryKokoroGpu().catch(() => {})}>
            Try the GPU again
          </Button>
        </div>
      )}
    </div>
  );
}
