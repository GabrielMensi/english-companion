"use client";

import { useRef, useState } from "react";
import { encodeWav, resample, SPEECH_SAMPLE_RATE, toMono } from "@/lib/audio/wav";

export interface Recording {
  /** 16 kHz mono 16-bit WAV. */
  wav: ArrayBuffer;
  durationMs: number;
}

/** Microphone recording in the browser, returned as 16 kHz mono WAV for speech-to-text. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    chunks.current = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = (e) => chunks.current.push(e.data);
    recorder.current = media;
    media.start();
    setRecording(true);
  }

  /** Stops and converts the recording; null if nothing was being recorded. */
  function stop(): Promise<Recording | null> {
    const media = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!media || media.state === "inactive") return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      media.onstop = async () => {
        media.stream.getTracks().forEach((t) => t.stop());
        try {
          resolve(await toWav(new Blob(chunks.current, { type: media.mimeType })));
        } catch (error) {
          reject(error);
        }
      };
      media.stop();
    });
  }

  /** Stops without keeping anything (e.g. the user pressed Escape). */
  function cancel() {
    const media = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!media || media.state === "inactive") return;
    media.onstop = () => media.stream.getTracks().forEach((t) => t.stop());
    media.stop();
  }

  return { recording, start, stop, cancel };
}

async function toWav(blob: Blob): Promise<Recording> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const samples = resample(toMono(channels), audio.sampleRate, SPEECH_SAMPLE_RATE);
    return { wav: encodeWav(samples, SPEECH_SAMPLE_RATE), durationMs: Math.round(audio.duration * 1000) };
  } finally {
    await context.close();
  }
}
