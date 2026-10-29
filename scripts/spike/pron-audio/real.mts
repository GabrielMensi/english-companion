/**
 * EVAL (#136, #134): runs the phoneme check (the app's `analyzePhonemes`) and the stress measure
 * over a folder of real recordings with a manifest, and prints per-clip results and a summary:
 * recall per category on clips with a deliberate error, false alarms on normal readings, and how
 * often the most prominent vowel of a word is the stressed one.
 *
 *   pnpm tsx scripts/spike/pron-audio/real.mts --init            write data/pron-real/manifest.json (the 33-clip set)
 *   pnpm tsx scripts/spike/pron-audio/real.mts --list            what to record, with instructions
 *   pnpm tsx scripts/spike/pron-audio/real.mts                   evaluate data/pron-real
 *   pnpm tsx scripts/spike/pron-audio/real.mts --dir=<folder>    another folder (with its manifest.json)
 *   pnpm tsx scripts/spike/pron-audio/real.mts --synthetic       the Kokoro set, to check the harness itself
 *
 * Audio: 16-bit PCM WAV in any sample rate (converted to 16 kHz mono).
 * Manifest: { "clips": ManifestClip[] } (see recording-set.ts); add your own sentences by hand.
 */
import fs from "node:fs";
import path from "node:path";

import { resample, SPEECH_SAMPLE_RATE, toMono } from "../../../src/lib/audio/wav";
import { cmuLookup } from "../../../src/lib/cmu-lookup";
import { alignSentence, analyzePhonemes, isVowel } from "../../../src/lib/phonemes-core";
import { scoreReading } from "../../../src/lib/pronunciation-core";

import { prosody } from "./audio";
import { SPIKE_DIR, VOICES } from "./clips";
import { loadRecognizer } from "./model";
import { isMinimum, type ManifestClip, recordingSet } from "./recording-set";
import { type StressScorer, STRESS_SCORERS, stressGuesses, vowelFeatures } from "./stress";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const dir = option("dir") ?? "data/pron-real";
const manifestFile = path.join(dir, "manifest.json");

if (flag("list")) {
  recordingSet().forEach((c, i) =>
    console.log(
      `${String(i + 1).padStart(2)}. ${isMinimum(c) ? "*" : " "} ${c.file.padEnd(28)} "${c.text}"\n      ${c.how}`,
    ),
  );
  console.log("\n* = the minimum set if time is short");
  process.exit(0);
}
if (flag("init")) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(manifestFile)) {
    console.log(`${manifestFile} already exists; not overwritten.`);
  } else {
    fs.writeFileSync(manifestFile, JSON.stringify({ clips: recordingSet() }, null, 2));
    console.log(`Wrote ${manifestFile}. Record the clips (--list) into ${dir}/ with the file names in the manifest.`);
  }
  process.exit(0);
}

/** Sound categories the phoneme check can find; the others in a manifest are not measured here. */
const DETECTABLE = ["schwa_reduction", "th_sounds", "b_v"] as const;

interface Clip extends ManifestClip {
  path: string;
  /** What speech-to-text heard, if known: also gives the check's verdicts on its issues. */
  transcript?: string;
}

let clips: Clip[];
if (flag("synthetic")) {
  clips = recordingSet().flatMap((c) =>
    VOICES.map((voice) => ({ ...c, file: `${voice}--${c.file}`, path: path.join(SPIKE_DIR, `${voice}--${c.file}`) })),
  );
} else {
  if (!fs.existsSync(manifestFile)) {
    console.error(`No ${manifestFile}. Run with --init first, then record the clips (--list).`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
    clips: (ManifestClip & { transcript?: string })[];
  };
  clips = manifest.clips.map((c) => ({ ...c, path: path.join(dir, c.file) }));
}

/** 16-bit PCM WAV of any sample rate or channel count, as 16 kHz mono samples. */
function readAudio(file: string): Float32Array {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a WAV file");
  let rate = 0;
  let channels = 1;
  for (let offset = 12; offset + 8 <= buf.length;) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      if (buf.readUInt16LE(offset + 8) !== 1 || buf.readUInt16LE(offset + 22) !== 16)
        throw new Error("expected 16-bit PCM");
      channels = buf.readUInt16LE(offset + 10);
      rate = buf.readUInt32LE(offset + 12);
    } else if (id === "data") {
      const total = Math.floor(Math.min(size, buf.length - offset - 8) / 2 / channels);
      const perChannel = Array.from({ length: channels }, (_, c) => {
        const samples = new Float32Array(total);
        for (let i = 0; i < total; i++) samples[i] = buf.readInt16LE(offset + 8 + (i * channels + c) * 2) / 0x8000;
        return samples;
      });
      return resample(toMono(perChannel), rate, SPEECH_SAMPLE_RATE);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no audio data");
}

const { recognize } = await loadRecognizer();

interface Row {
  file: string;
  kind: string;
  seconds: number;
  ms: number;
  heard: string;
  hints: string;
  /** Detectable categories of the clip found / missed, and hints in categories it shouldn't have. */
  found: string[];
  missed: string[];
  unexpected: string[];
  checks: string;
  stressTruth: number | null;
  stressGuess: Record<StressScorer, number> | null;
}
const rows: Row[] = [];
const missingFiles: string[] = [];

for (const clip of clips) {
  if (!fs.existsSync(clip.path)) {
    missingFiles.push(clip.file);
    continue;
  }
  const samples = readAudio(clip.path);
  const started = Date.now();
  const heardPhones = await recognize(samples);
  const ms = Date.now() - started;

  const issues = clip.transcript ? scoreReading(clip.text, clip.transcript, cmuLookup).issues : [];
  const analysis = analyzePhonemes(clip.text, issues, heardPhones, cmuLookup);
  const categories = new Set(analysis.hints.map((h) => h.category));

  const wanted = clip.errors.filter((e): e is (typeof DETECTABLE)[number] =>
    (DETECTABLE as readonly string[]).includes(e),
  );
  const wordMatch = (category: string) =>
    !clip.words || analysis.hints.some((h) => h.category === category && clip.words!.includes(h.word));
  const found = wanted.filter((c) => categories.has(c) && wordMatch(c));

  let stressTruth: number | null = null;
  let stressGuess: Row["stressGuess"] = null;
  if (clip.stress) {
    const { words, heard, slots } = alignSentence(clip.text, heardPhones, cmuLookup);
    const wordIndex = words.indexOf(clip.stress.word);
    const vowels = slots.filter((s) => s.word === wordIndex && isVowel(s.token));
    stressTruth = clip.stress.syllable;
    if (vowels.length > 1 && vowels.every((v) => v.heardIndex >= 0)) {
      stressGuess = stressGuesses(
        vowelFeatures(
          prosody(samples, SPEECH_SAMPLE_RATE),
          vowels.map((v) => heard[v.heardIndex]),
        ),
      );
    }
  }

  rows.push({
    file: clip.file,
    kind: clip.kind,
    seconds: +(samples.length / SPEECH_SAMPLE_RATE).toFixed(1),
    ms,
    heard: analysis.heard,
    hints: analysis.hints.map((h) => `${h.word} ${h.category} ${h.detail}`).join("; "),
    found,
    missed: wanted.filter((c) => !found.includes(c)),
    // On normal readings every hint is a false alarm; on others, hints outside the intended categories.
    unexpected: [...categories].filter((c) => !wanted.includes(c as (typeof DETECTABLE)[number])),
    checks: analysis.checks.map((c) => `${c.issue}:${c.verdict}`).join(" "),
    stressTruth,
    stressGuess,
  });
}

console.table(
  rows.map((r) => ({
    file: r.file,
    kind: r.kind,
    s: r.seconds,
    ms: r.ms,
    found: r.found.join(","),
    missed: r.missed.join(","),
    unexpected: r.unexpected.join(","),
    hints: r.hints.slice(0, 60),
  })),
);
if (missingFiles.length > 0) console.log(`Not recorded yet (${missingFiles.length}): ${missingFiles.join(", ")}`);

const ratio = (n: number, d: number) => `${n}/${d}${d > 0 ? ` (${Math.round((n / d) * 100)}%)` : ""}`;
const ok = rows.filter((r) => r.kind === "ok");
const recall = Object.fromEntries(
  DETECTABLE.map((category) => {
    const withError = rows.filter((r) => r.found.includes(category) || r.missed.includes(category));
    return [category, ratio(withError.filter((r) => r.found.includes(category)).length, withError.length)];
  }),
);
const stressRows = rows.filter((r) => r.stressGuess);
const stressAccuracy = Object.fromEntries(
  (Object.keys(STRESS_SCORERS) as StressScorer[]).map((name) => [
    name,
    {
      correctReadings: ratio(
        stressRows.filter((r) => r.kind === "ok" && r.stressGuess![name] === r.stressTruth).length,
        stressRows.filter((r) => r.kind === "ok").length,
      ),
      wrongStress: ratio(
        stressRows.filter((r) => r.kind === "stress" && r.stressGuess![name] === r.stressTruth).length,
        stressRows.filter((r) => r.kind === "stress").length,
      ),
    },
  ]),
);
const summary = {
  clips: rows.length,
  notRecorded: missingFiles.length,
  avgMsPerClip: rows.length ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length) : 0,
  // Of the clips with a deliberate error in a category the check can find, how many it found.
  recall,
  // Normal readings with any hint at all: the number that decides if schwa can count in stats.
  falseAlarmsOnNormalReadings: ratio(ok.filter((r) => r.unexpected.length > 0).length, ok.length),
  falseAlarmsByCategory: Object.fromEntries(
    DETECTABLE.map((c) => [c, ratio(ok.filter((r) => r.unexpected.includes(c)).length, ok.length)]),
  ),
  // Word stress: the vowel with the most loudness/pitch/length is the stressed one (the clip's, right or wrong).
  stressAccuracy,
  stressClips: stressRows.length,
};
console.log(summary);

const outDir = path.resolve(".eval-results");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `pron-real-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), out)}`);
