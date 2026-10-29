/**
 * Speech-to-text fidelity eval (voice Phase 0): transcribes the recordings
 * made at /eval/asr and checks whether each engine keeps the learner's
 * mistakes or "fixes" them.
 *
 *   pnpm eval:asr                       # every remote engine with a key
 *   pnpm eval:asr groq:whisper-large-v3-turbo gemini:gemini-3.5-transcribe
 *
 * Engines:
 *   groq:<model>            Groq Whisper, temperature 0
 *   groq-verbatim:<model>   same, with a prompt in a verbatim, ungrammatical style
 *   gemini:<model>          Gemini Transcribe, VERBATIM mode
 *   gemini-smart:<model>    Gemini Transcribe, SMART mode (for comparison)
 *   gemini-llm:<model>      a Gemini chat model asked to transcribe literally
 *
 * Options: --delay=<ms> between remote requests (default 3000).
 *          --check  print PASS/FAIL per engine against thresholds.json and exit 1 on a regression.
 * API keys come from the app's settings (DATABASE_PATH) or .env.local.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, transcribe } from "ai";
import { shortReason } from "../../src/lib/ai/fallback";
import { ASR_SAMPLES } from "../../src/lib/eval/asr-samples";
import { type MistakeOutcome, scoreTranscript } from "../../src/lib/eval/asr-score";
import { ASR_SAMPLES_DIR } from "../../src/lib/eval/asr-store";
import { resolveApiKey } from "../../src/lib/secrets";
import { evalUserId } from "./settings";

const userId = (await evalUserId()) ?? "";
import { reportCheck, wantsCheck } from "./check";

/** Whisper imitates the prompt's style: an ungrammatical, disfluent one discourages "cleaning up". */
const VERBATIM_PROMPT =
  "Umm, so yesterday I goed to the... the store, and eh, I buyed some thing. He don't know nothing about it.";

const args = process.argv.slice(2);
const delayMs = Number(args.find((a) => a.startsWith("--delay="))?.split("=")[1] ?? 3000);
let specs = args.filter((a) => !a.startsWith("--"));
if (specs.length === 0) {
  specs = [
    ...(resolveApiKey(userId, "groq") ? ["groq:whisper-large-v3-turbo", "groq-verbatim:whisper-large-v3-turbo"] : []),
    ...(resolveApiKey(userId, "gemini")
      ? ["gemini:gemini-3.5-transcribe", "gemini-smart:gemini-3.5-transcribe", "gemini-llm:gemini-flash-lite-latest"]
      : []),
  ];
}

const samples = ASR_SAMPLES.filter((s) => fs.existsSync(path.join(ASR_SAMPLES_DIR, `${s.id}.wav`)));
if (samples.length === 0) {
  console.error("No recordings yet. Record the sentences at http://localhost:3737/eval/asr first.");
  process.exit(1);
}
if (specs.length === 0) {
  console.error("No engines: add a Groq or Gemini API key in Settings.");
  process.exit(1);
}
console.log(`${samples.length} of ${ASR_SAMPLES.length} sentences recorded.`);

/** A provider that never answers must not hang the whole run. */
const REQUEST_TIMEOUT_MS = 60_000;

type Transcriber = (audio: Buffer, abortSignal: AbortSignal) => Promise<string>;

function transcriber(engine: string, model: string): Transcriber {
  switch (engine) {
    case "groq":
    case "groq-verbatim": {
      const groq = createGroq({ apiKey: requireKey("groq") });
      return async (audio, abortSignal) =>
        (
          await transcribe({
            model: groq.transcription(model),
            audio,
            abortSignal,
            providerOptions: {
              groq: {
                language: "en",
                temperature: 0,
                ...(engine === "groq-verbatim" ? { prompt: VERBATIM_PROMPT } : {}),
              },
            },
          })
        ).text;
    }
    case "gemini":
    case "gemini-smart": {
      const google = createGoogleGenerativeAI({ apiKey: requireKey("gemini") });
      return async (audio, abortSignal) =>
        (
          await transcribe({
            model: google.transcription(model),
            audio,
            abortSignal,
            providerOptions: { google: { mode: engine === "gemini" ? "VERBATIM" : "SMART", languageCodes: ["en-US"] } },
          })
        ).text;
    }
    case "gemini-llm": {
      const google = createGoogleGenerativeAI({ apiKey: requireKey("gemini") });
      return async (audio, abortSignal) =>
        (
          await generateText({
            model: google(model),
            temperature: 0,
            abortSignal,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Transcribe this English audio word for word. The speaker is learning English and makes grammar mistakes: keep every mistake exactly as spoken, never correct grammar. Return only the transcript.",
                  },
                  { type: "file", data: audio, mediaType: "audio/wav" },
                ],
              },
            ],
          })
        ).text;
    }
    default:
      throw new Error(`Unknown engine "${engine}"`);
  }
}

function requireKey(provider: "groq" | "gemini") {
  const resolved = resolveApiKey(userId, provider);
  if (!resolved) throw new Error(`Missing ${provider} API key`);
  return resolved.key;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const summary: Record<string, string | number>[] = [];
const details: unknown[] = [];
let regressed = false;

for (const spec of specs) {
  const [engine, ...rest] = spec.split(":");
  const model = rest.join(":");
  console.log(`\n▶ ${spec}`);
  let run: Transcriber;
  try {
    run = transcriber(engine, model);
  } catch (error) {
    console.log(`  ${(error as Error).message}`);
    continue;
  }

  const outcomes: Record<MistakeOutcome, number> = { kept: 0, fixed: 0, lost: 0 };
  const wers: number[] = [];
  const times: number[] = [];
  let failures = 0;

  for (const [i, sample] of samples.entries()) {
    if (i > 0) await sleep(delayMs);
    const audio = fs.readFileSync(path.join(ASR_SAMPLES_DIR, `${sample.id}.wav`));
    const started = Date.now();
    try {
      const transcript = (await run(audio, AbortSignal.timeout(REQUEST_TIMEOUT_MS))).trim();
      times.push(Date.now() - started);
      const score = scoreTranscript(sample, transcript);
      outcomes[score.outcome]++;
      wers.push(score.wer);
      const mark = score.outcome === "kept" ? "✓" : score.outcome === "fixed" ? "✗ fixed" : "? lost ";
      console.log(`  ${mark}  ${transcript}`);
      details.push({ spec, id: sample.id, read: sample.text, transcript, ...score });
    } catch (error) {
      failures++;
      console.log(`  FAIL  ${sample.id}: ${shortReason(error)}`);
      details.push({ spec, id: sample.id, error: String(error) });
    }
  }

  const done = samples.length - failures;
  if (wantsCheck(args)) {
    const metrics = { wer: wers.length ? wers.reduce((a, b) => a + b, 0) / wers.length : null, failures };
    regressed = !reportCheck("asr", spec, metrics) || regressed;
  }
  const pct = (n: number) => (done ? `${Math.round((n / done) * 100)}%` : "-");
  summary.push({
    engine: spec,
    kept: pct(outcomes.kept),
    fixed: pct(outcomes.fixed),
    lost: pct(outcomes.lost),
    wer: wers.length ? +(wers.reduce((a, b) => a + b, 0) / wers.length).toFixed(3) : "-",
    failures,
    avgSeconds: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : "-",
  });
}

console.log(
  "\nkept = the mistake survived (good) · fixed = the engine corrected it (hides it from the tutor) · lost = neither\n",
);
console.table(summary);

const dir = path.resolve(".eval-results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `asr-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, details }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), file)}`);
if (regressed) process.exitCode = 1;
