/**
 * Compares models on the evaluation set.
 *
 *   pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b
 *
 * Options:
 *   --delay=<ms>   pause between requests (default 4000,
 *                  to stay under free-tier per-minute limits)
 *   --limit=<n>    only run the first n samples
 *
 * API keys come from the app's settings (or .env.local).
 * Results are printed as a table and saved to .eval-results/.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeMessage } from "../../src/lib/ai/analyze";
import { errorToMessage } from "../../src/lib/ai/fallback";
import { PROVIDER_IDS, type ProviderId } from "../../src/lib/ai/provider-info";
import { getSettings } from "../../src/lib/settings";
import { SAMPLES } from "./samples";
import { scoreSample } from "./score";

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const delayMs = Number(option("delay") ?? 4000);
const samples = SAMPLES.slice(0, Number(option("limit") ?? SAMPLES.length));
const specs = args.filter((a) => !a.startsWith("--"));

if (specs.length === 0) {
  console.error("Usage: pnpm eval:models <provider>:<model> [...] [--delay=ms] [--limit=n]");
  process.exit(1);
}

const base = getSettings();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const summary: Record<string, string | number>[] = [];
const details: unknown[] = [];

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
  const times: number[] = [];
  console.log(`\n▶ ${spec}`);

  for (const [i, sample] of samples.entries()) {
    if (i > 0) await sleep(delayMs);
    const started = Date.now();
    try {
      const { analysis } = await analyzeMessage({ text: sample.text, mode: "correction", history: [] }, settings);
      const ms = Date.now() - started;
      const score = scoreSample(sample, analysis);
      times.push(ms);
      points += score.points;
      possible += score.possible;
      falsePositives += score.falsePositives;
      console.log(`  ${score.points}/${score.possible}  ${(ms / 1000).toFixed(1)}s  ${sample.text.slice(0, 60)}`);
      for (const m of score.missed) console.log(`        · ${m}`);
      details.push({ spec, text: sample.text, ms, score, analysis });
    } catch (error) {
      failures++;
      // A failed request still counts its possible points, so failures lower the score.
      possible += scoreSample(sample, { correctedText: "", naturalText: null, errors: [], spanishPhrases: [], reply: null })
        .possible;
      console.log(`  FAIL  ${sample.text.slice(0, 60)}\n        · ${errorToMessage(error)}`);
      details.push({ spec, text: sample.text, error: errorToMessage(error) });
    }
  }

  times.sort((a, b) => a - b);
  summary.push({
    model: spec,
    score: possible ? `${Math.round((points / possible) * 100)}%` : "-",
    points: `${points}/${possible}`,
    failures,
    falsePositives,
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
