import "server-only";

import fs from "node:fs";
import path from "node:path";

import { serverEnv } from "@/lib/env";

import { ASR_SAMPLES } from "./asr-samples";

/** Recordings for the speech-to-text eval: data/asr-samples/<id>.wav (never in git), or ASR_SAMPLES_DIR. */
export const ASR_SAMPLES_DIR = path.resolve(/*turbopackIgnore: true*/ serverEnv().ASR_SAMPLES_DIR);

export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

export function isAsrSampleId(id: string): boolean {
  return ASR_SAMPLES.some((s) => s.id === id);
}

export function listRecordedSamples(): string[] {
  if (!fs.existsSync(ASR_SAMPLES_DIR)) return [];
  return ASR_SAMPLES.filter((s) => fs.existsSync(samplePath(s.id))).map((s) => s.id);
}

export function saveSampleRecording(id: string, wav: Buffer) {
  if (!isAsrSampleId(id)) throw new Error("Unknown sample");
  if (wav.length > MAX_RECORDING_BYTES) throw new Error("Recording too long");
  if (wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new Error("Expected a WAV file");
  }
  fs.mkdirSync(ASR_SAMPLES_DIR, { recursive: true });
  fs.writeFileSync(samplePath(id), wav);
}

export function readSampleRecording(id: string): Buffer | null {
  return isAsrSampleId(id) && fs.existsSync(samplePath(id)) ? fs.readFileSync(samplePath(id)) : null;
}

function samplePath(id: string) {
  return path.join(ASR_SAMPLES_DIR, `${id}.wav`);
}
