/**
 * Compares models on classifying already-detected mistakes (the deferred step).
 *
 *   pnpm eval:classify gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b
 *
 * Options:
 *   --batch=<n>    mistakes per request, as in the app (default 8)
 *   --delay=<ms>   pause between requests (default 4000)
 *   --check        print PASS/FAIL per model against thresholds.json and exit 1 on a regression
 *
 * Also scores the labels you fixed by hand with "Wrong type?" in the app
 * (--with-user-labels), read from the database in DATABASE_PATH.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { classifyBatch } from "../../src/lib/ai/classify";
import type { ClassificationItem } from "../../src/lib/ai/classify-core";
import { errorToMessage } from "../../src/lib/ai/fallback";
import { PROVIDER_IDS, type ProviderId } from "../../src/lib/ai/provider-info";
import { getSettings } from "../../src/lib/settings";
import { TENSE_CATEGORIES } from "../../src/lib/taxonomy";
import { reportCheck, wantsCheck } from "./check";
import { CLASSIFY_SAMPLES, type ClassifySample } from "./classify-samples";

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const batchSize = Number(option("batch") ?? 8);
const delayMs = Number(option("delay") ?? 4000);
const specs = args.filter((a) => !a.startsWith("--"));

if (specs.length === 0) {
  console.error(
    "Usage: pnpm eval:classify <provider>:<model> [...] [--batch=n] [--delay=ms] [--with-user-labels] [--check]",
  );
  process.exit(1);
}

async function loadSamples(): Promise<ClassifySample[]> {
  if (!args.includes("--with-user-labels")) return CLASSIFY_SAMPLES;
  const { db, schema } = await import("../../src/db");
  const { eq } = await import("drizzle-orm");
  const labeled = db
    .select({
      message: schema.messages.content,
      original: schema.corrections.original,
      correction: schema.corrections.correction,
      category: schema.corrections.category,
      subtype: schema.corrections.subtype,
      tense: schema.corrections.tense,
      tenseUsed: schema.corrections.tenseUsed,
    })
    .from(schema.corrections)
    .innerJoin(schema.messages, eq(schema.corrections.messageId, schema.messages.id))
    .where(eq(schema.corrections.classifiedBy, "user"))
    .all()
    .map((row) => ({ ...row, subtype: row.subtype ?? "other" }));
  console.log(`Using ${CLASSIFY_SAMPLES.length} samples + ${labeled.length} labels fixed in the app`);
  return [...CLASSIFY_SAMPLES, ...labeled];
}

const samples = await loadSamples();
const base = getSettings();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const summary: Record<string, string | number>[] = [];
const details: unknown[] = [];
let regressed = false;

const items: ClassificationItem[] = samples.map((s, i) => ({
  id: String(i),
  category: s.category,
  severity: "moderate",
  original: s.original,
  correction: s.correction,
  explanation: "",
  message: s.message,
}));

for (const spec of specs) {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  if (!PROVIDER_IDS.includes(provider as ProviderId) || !model) {
    console.error(`Invalid spec "${spec}". Use <provider>:<model>, e.g. gemini:gemini-flash-lite-latest`);
    continue;
  }
  const settings = {
    ...base,
    provider: provider as ProviderId,
    models: { ...base.models, [provider]: model },
    fallbacks: [],
  };

  let subtypeOk = 0;
  let tenseOk = 0;
  let tenseTotal = 0;
  let tenseUsedOk = 0;
  let missing = 0;
  const times: number[] = [];
  console.log(`\n▶ ${spec}`);

  for (let start = 0; start < items.length; start += batchSize) {
    if (start > 0) await sleep(delayMs);
    const batch = items.slice(start, start + batchSize);
    const started = Date.now();
    let results: Awaited<ReturnType<typeof classifyBatch>>["results"] = new Map();
    try {
      ({ results } = await classifyBatch(batch, settings));
      times.push(Date.now() - started);
    } catch (error) {
      console.log(`  FAIL batch ${start / batchSize + 1}: ${errorToMessage(error)}`);
    }

    for (const item of batch) {
      const sample = samples[Number(item.id)];
      const got = results.get(item.id);
      if (!got) {
        missing++;
        console.log(`  ✗ missing: "${sample.original}"`);
        continue;
      }
      const problems: string[] = [];
      if (got.subtype === sample.subtype) subtypeOk++;
      else problems.push(`type ${got.subtype} (expected ${sample.subtype})`);
      if (TENSE_CATEGORIES.includes(sample.category) && sample.tense !== undefined) {
        tenseTotal++;
        if (got.tense === sample.tense) tenseOk++;
        else problems.push(`tense ${got.tense} (expected ${sample.tense})`);
        if (got.tenseUsed === (sample.tenseUsed ?? null)) tenseUsedOk++;
        else problems.push(`used ${got.tenseUsed} (expected ${sample.tenseUsed ?? null})`);
      }
      console.log(
        `  ${problems.length === 0 ? "✓" : "✗"} ${sample.original}${problems.length ? `  · ${problems.join(", ")}` : ""}`,
      );
      details.push({ spec, sample, got });
    }
  }

  if (wantsCheck(args)) {
    const rate = (n: number, d: number) => (d ? (n / d) * 100 : null);
    const metrics = {
      typePct: rate(subtypeOk, samples.length),
      tensePct: rate(tenseOk, tenseTotal),
      tenseUsedPct: rate(tenseUsedOk, tenseTotal),
      missing,
    };
    regressed = !reportCheck("classify", spec, metrics) || regressed;
  }
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");
  summary.push({
    model: spec,
    type: pct(subtypeOk, samples.length),
    tense: pct(tenseOk, tenseTotal),
    tenseUsed: pct(tenseUsedOk, tenseTotal),
    missing,
    avgSecondsPerBatch: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : "-",
  });
}

console.log("\n");
console.table(summary);

const dir = path.resolve(".eval-results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `classify-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, details }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), file)}`);
if (regressed) process.exitCode = 1;
