/**
 * Compares models on the evaluation set.
 *
 *   pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b
 *
 * Options:
 *   --delay=<ms>   pause between requests (default 4000,
 *                  to stay under free-tier per-minute limits)
 *   --limit=<n>    only run the first n samples
 *   --topics       also run the topic and role-play samples (conversation mode with the preset's rule)
 *   --topics-only  only the topic samples
 *   --topics-plain with --topics/--topics-only: the same samples as a plain conversation, without the topic (control)
 *   --with-discards  also run the corrections you discarded (pnpm eval:export-discards first); scores
 *                  "false positive avoided" and prints repeatedDiscards
 *                  (discarded messages are shown as numbers: it's your own text, kept out of the terminal)
 *   --check        print PASS/FAIL per model against thresholds.json and exit 1 on a regression
 *                  (only for the plain set: not with --topics*, --with-discards or --limit)
 *
 * API keys come from the app's settings (or .env.local).
 * Results are printed as a table and saved to .eval-results/.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { analyzeMessage } from "../../src/lib/ai/analyze";
import { errorToMessage } from "../../src/lib/ai/fallback";
import { PROVIDER_IDS, type ProviderId } from "../../src/lib/ai/provider-info";
import { DISCARDS_FILE } from "../../src/lib/eval/discards";
import { findPreset } from "../../src/lib/topics";
import { SAMPLES, TOPIC_SAMPLES, type Sample, type TopicSample } from "./samples";
import { reportCheck, wantsCheck } from "./check";
import { evalSettings, evalUserId } from "./settings";
import { scoreSample } from "./score";

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const delayMs = Number(option("delay") ?? 4000);
const topicsOnly = args.includes("--topics-only");
const plainTopics = args.includes("--topics-plain");

if (
  wantsCheck(args) &&
  ["--topics", "--topics-only", "--topics-plain", "--with-discards", "--limit"].some((f) =>
    args.some((a) => a === f || a.startsWith(`${f}=`)),
  )
) {
  console.error(
    "--check compares against thresholds set on the plain sample set: don't combine it with --topics*, --with-discards or --limit.",
  );
  process.exit(1);
}

function loadDiscards(): Sample[] {
  if (!args.includes("--with-discards")) return [];
  if (!fs.existsSync(DISCARDS_FILE)) {
    console.error(`${DISCARDS_FILE} not found: run pnpm eval:export-discards first`);
    process.exit(1);
  }
  const discards = JSON.parse(fs.readFileSync(DISCARDS_FILE, "utf8")) as Sample[];
  console.log(`Including ${discards.length} messages with discarded corrections`);
  return discards;
}

const isTopic = (s: Sample): s is TopicSample => "topic" in s;
const allSamples: Sample[] = [
  ...(topicsOnly ? [] : SAMPLES),
  ...(topicsOnly || args.includes("--topics") || plainTopics ? TOPIC_SAMPLES : []),
  ...loadDiscards(),
];
const samples = allSamples.slice(0, Number(option("limit") ?? allSamples.length));

/**
 * Topic samples go as conversation-mode messages after the tutor's opening question; discarded
 * messages with the chat they came from; the rest as plain corrections.
 */
function requestFor(sample: Sample) {
  if (isTopic(sample)) {
    const preset = findPreset(sample.topic);
    if (!preset) throw new Error(`Unknown topic "${sample.topic}" in TOPIC_SAMPLES: not a preset in src/lib/topics.ts`);
    return {
      text: sample.text,
      mode: "conversation" as const,
      history: [{ learner: null, assistant: preset.openings[0] }],
      practiceRule: plainTopics ? undefined : preset.rule,
    };
  }
  if (sample.context) return { text: sample.text, inputMode: sample.inputMode, ...sample.context };
  return { text: sample.text, mode: "correction" as const, history: [], inputMode: sample.inputMode };
}

/** What to show for a sample: discarded ones are the learner's own text, so only a number. */
const labelOf = (sample: Sample, i: number) => (sample.forbidden ? `discard #${i + 1}` : sample.text.slice(0, 60));

// Fail before the first API call if a topic sample points to a missing preset.
for (const sample of samples) requestFor(sample);

const specs = args.filter((a) => !a.startsWith("--"));

if (specs.length === 0) {
  console.error(
    "Usage: pnpm eval:models <provider>:<model> [...] [--delay=ms] [--limit=n] [--topics|--topics-only] [--topics-plain] [--with-discards] [--check]",
  );
  process.exit(1);
}

const base = await evalSettings();
const userId = (await evalUserId()) ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const summary: Record<string, string | number>[] = [];
const details: unknown[] = [];
let regressed = false;

for (const spec of specs) {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  if (!PROVIDER_IDS.includes(provider as ProviderId) || !model) {
    console.error(`Invalid spec "${spec}". Use <provider>:<model>, e.g. gemini:gemini-flash-lite-latest`);
    continue;
  }
  // No fallbacks: we want to measure this model only.
  const settings = {
    ...base,
    provider: provider as ProviderId,
    models: { ...base.models, [provider]: model },
    fallbacks: [],
  };

  let points = 0;
  let possible = 0;
  let failures = 0;
  let falsePositives = 0;
  let repeatedDiscards = 0;
  const times: number[] = [];
  console.log(`\n▶ ${spec}`);

  for (const [i, sample] of samples.entries()) {
    if (i > 0) await sleep(delayMs);
    const started = Date.now();
    try {
      const { analysis } = await analyzeMessage(userId, requestFor(sample), settings);
      const ms = Date.now() - started;
      const score = scoreSample(sample, analysis);
      times.push(ms);
      points += score.points;
      possible += score.possible;
      falsePositives += score.falsePositives;
      repeatedDiscards += score.repeatedDiscards;
      console.log(`  ${score.points}/${score.possible}  ${(ms / 1000).toFixed(1)}s  ${labelOf(sample, i)}`);
      for (const m of score.missed)
        console.log(`        · ${sample.forbidden ? "reported a discarded correction" : m}`);
      details.push({ spec, text: sample.text, ms, score, analysis });
    } catch (error) {
      failures++;
      // A failed request still counts its possible points, so failures lower the score.
      possible += scoreSample(sample, {
        correctedText: "",
        naturalText: null,
        errors: [],
        spanishPhrases: [],
        reply: null,
      }).possible;
      console.log(`  FAIL  ${labelOf(sample, i)}\n        · ${errorToMessage(error)}`);
      details.push({ spec, text: sample.text, error: errorToMessage(error) });
    }
  }

  times.sort((a, b) => a - b);
  if (wantsCheck(args)) {
    const metrics = { scorePct: possible ? (points / possible) * 100 : null, failures, falsePositives };
    regressed = !reportCheck("models", spec, metrics) || regressed;
  }
  summary.push({
    model: spec,
    score: possible ? `${Math.round((points / possible) * 100)}%` : "-",
    points: `${points}/${possible}`,
    failures,
    falsePositives,
    ...(args.includes("--with-discards") ? { repeatedDiscards } : {}),
    avgSeconds: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : "-",
    p90Seconds: times.length ? +(times[Math.floor(times.length * 0.9)] / 1000).toFixed(1) : "-",
  });
}

console.log("\n");
console.table(summary);

const dir = path.resolve(".eval-results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, details }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), file)}`);
if (regressed) process.exitCode = 1;
