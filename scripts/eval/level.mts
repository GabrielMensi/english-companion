/**
 * Checks the CEFR level estimate (src/lib/insights/level-core.ts) against
 * learner writing graded by humans: Write & Improve essays with a CEFR level
 * (see level-data.ts for the corpus, its licence and how to download it).
 *
 *   pnpm eval:level
 *
 * Essays of the same level are joined into "learners" of about --words words
 * (default 1000), each one estimated like the app does, and the result is
 * compared with the human level: exact and adjacent (±1 level) agreement, a
 * confusion matrix, and the same for each signal on its own. The "train" and
 * "dev" splits are reported apart: the anchors were set looking at train, so
 * dev is the honest number.
 *
 * Mistakes come from the corpus' human corrections, sorted into what the app
 * would count (see classifyEdit) and scaled by --app-ratio: the app's AI
 * counts fewer mistakes than the corpus' annotators (about 0.6 of them, at
 * every level, on 30 essays with gemini-flash-lite). To measure that ratio,
 * run a few essays through the real analysis (uses quota!):
 *
 *   pnpm eval:level --analyze=gemini:gemini-flash-lite-latest --limit=30
 *
 * Analyses are cached in .eval-results/level-analysis-cache.json, so a second
 * run doesn't spend requests again.
 *
 * Options:
 *   --dir=<path>     corpus folder (default data/cefr/wi+locness)
 *   --words=<n>      words per simulated learner (default 1000)
 *   --count-typos    count spelling slips, like the app's setting
 *   --app-ratio=<r>  share of the corpus' mistakes the app would count (default 0.6)
 *   --spoken         treat every essay as dictated
 *   --analyze=<provider>:<model>  compare corpus mistakes with the app's (needs --limit)
 *   --limit=<n>      essays to analyze, spread across levels (default 24)
 *   --delay=<ms>     pause between remote requests (default 4000)
 */
import fs from "node:fs";
import path from "node:path";
import {
  CEFR_LEVELS,
  type CefrLevel,
  estimateLevel,
  type LevelCorrection,
  type LevelMessage,
  type LevelEstimate,
  measureLevel,
  type SignalId,
} from "../../src/lib/insights/level-core";
import type { InputMode } from "../../src/db/schema";
import { countsInStats } from "../../src/lib/taxonomy";
import { countTenses, TENSE_COUNTER_VERSION, type TenseCounts } from "../../src/lib/tenses-core";
import { countWords } from "../../src/lib/text";
import { type Bundle, bundleEssays, DEFAULT_CORPUS_DIR, type Edit, type Essay, loadEssays } from "./level-data";

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dir = option("dir") ?? DEFAULT_CORPUS_DIR;
const targetWords = Number(option("words") ?? 1000);
const countTypos = args.includes("--count-typos");
const analyzeSpec = option("analyze");
const appRatio = Number(option("app-ratio") ?? 0.6);
const inputMode: InputMode = args.includes("--spoken") ? "spoken" : "typed";

const LABELS = [...CEFR_LEVELS, "N"] as const;
type Label = (typeof LABELS)[number];
const levelIndex = (l: Label) => (l === "N" ? 6 : CEFR_LEVELS.indexOf(l) + 1);

const resultsDir = path.resolve(".eval-results");
const tenseCache: Record<string, TenseCounts> = {};
fs.mkdirSync(resultsDir, { recursive: true });

const essays = loadEssays(dir);
console.log(`Loaded ${essays.length} essays from ${dir}`);

if (analyzeSpec) {
  await compareWithApp(analyzeSpec);
} else {
  runEstimator();
}

function runEstimator() {
  // Counting tenses is the slow part (about 2 minutes): cache it per essay.
  const tenseCacheFile = path.join(resultsDir, "level-tenses-cache.json");
  const cached = fs.existsSync(tenseCacheFile) ? JSON.parse(fs.readFileSync(tenseCacheFile, "utf8")) : null;
  if (cached?.version === TENSE_COUNTER_VERSION) Object.assign(tenseCache, cached.counts);

  const bundles = bundleEssays(essays, targetWords, countWords);
  const started = Date.now();
  const rows = bundles.map((b) => {
    const { messages, corrections } = toLevelInput(b.essays);
    const estimate = estimateLevel({ messages, corrections, countTypos });
    const measures = measureLevel(messages, corrections, countTypos);
    return { bundle: b, estimate, measures };
  });
  fs.writeFileSync(tenseCacheFile, JSON.stringify({ version: TENSE_COUNTER_VERSION, counts: tenseCache }));
  console.log(`Estimated ${rows.length} learners of ~${targetWords} words in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const report: Record<string, unknown> = { words: targetWords, countTypos, appRatio, inputMode };
  for (const split of ["train", "dev"] as const) {
    const learners = rows.filter((r) => r.bundle.split === split && r.bundle.level !== "N");
    const natives = rows.filter((r) => r.bundle.split === split && r.bundle.level === "N");
    if (learners.length === 0) continue;
    console.log(`\n━━ ${split} · ${learners.length} learners${natives.length ? ` + ${natives.length} native` : ""} ━━`);

    const overall = agreement(learners.map((r) => [r.bundle.level as CefrLevel, r.estimate.score!]));
    console.log(
      `Estimate: exact ${pct(overall.exact)} · adjacent ${pct(overall.adjacent)} · mean error ${overall.mae.toFixed(2)} levels · score RMSE ${overall.rmse.toFixed(2)} · bias ${overall.bias >= 0 ? "+" : ""}${overall.bias.toFixed(2)}`,
    );
    printMatrix(rows.filter((r) => r.bundle.split === split).map((r) => [r.bundle.level, r.estimate.level!]));

    const signals: Record<string, ReturnType<typeof agreement>> = {};
    for (const id of ["accuracy", "grammar", "complexity", "vocabulary"] as SignalId[]) {
      signals[id] = agreement(learners.map((r) => [r.bundle.level as CefrLevel, signalScore(r.estimate, id)]));
    }
    console.log("\nEach signal on its own:");
    console.table(
      Object.fromEntries(
        Object.entries(signals).map(([id, a]) => [
          id,
          { exact: pct(a.exact), adjacent: pct(a.adjacent), meanError: +a.mae.toFixed(2), bias: +a.bias.toFixed(2), spearman: +a.spearman.toFixed(2) },
        ]),
      ),
    );

    const medians = medianMeasures(rows.filter((r) => r.bundle.split === split));
    console.log("Median measurements by level (what the anchors should be close to):");
    console.table(medians);
    report[split] = { learners: learners.length, natives: natives.length, overall, signals, medians };
  }

  const file = path.join(resultsDir, `level-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...report,
        learners: rows.map((r) => ({
          id: r.bundle.id,
          level: r.bundle.level,
          essays: r.bundle.essays.length,
          estimate: r.estimate.level,
          score: r.estimate.score,
          signals: Object.fromEntries(r.estimate.signals.map((s) => [s.id, s.score])),
          measures: r.measures,
        })),
      },
      null,
      1,
    ),
  );
  console.log(`\nDetails saved to ${path.relative(process.cwd(), file)}`);
}

function toLevelInput(list: Essay[]) {
  const messages: LevelMessage[] = list.map((e, i) => ({
    id: e.id,
    createdAt: i,
    wordCount: countWords(e.text),
    text: e.text,
    inputMode,
    tenseCounts: (tenseCache[e.id] ??= countTenses(e.correctedText)),
  }));
  const corrections: LevelCorrection[] = list.flatMap((e) => {
    let kept = 0;
    return e.edits.flatMap((edit) => {
      const correction = { ...toCorrection(e.id, edit), inputMode };
      if (edit.kind !== "grammar") return [correction];
      // Keep `appRatio` of the mistakes, spread evenly through the essay (deterministic).
      kept++;
      if (Math.floor(kept * appRatio) <= Math.floor((kept - 1) * appRatio)) return [];
      // Dictated: about half the mistakes are in categories that aren't counted when speaking.
      if (inputMode === "spoken" && kept % 2 === 0) return [{ ...correction, category: "articles" as const }];
      return [correction];
    });
  });
  return { messages, corrections };
}

/** The corpus' corrections as the app would store them (mechanics are suggestions, spelling slips typos). */
function toCorrection(messageId: string, edit: Edit): LevelCorrection {
  if (edit.kind === "mechanics") return { messageId, severity: "suggestion", category: "punctuation", inputMode: "typed" };
  if (edit.kind === "spelling") return { messageId, severity: "typo", category: "spelling", inputMode: "typed" };
  return { messageId, severity: "moderate", category: "other", inputMode: "typed" };
}

function signalScore(estimate: LevelEstimate, id: SignalId) {
  return estimate.signals.find((s) => s.id === id)!.score;
}

function agreement(pairs: [CefrLevel, number][]) {
  const truth = pairs.map(([l]) => levelIndex(l));
  const predicted = pairs.map(([, score]) => Math.min(6, Math.max(1, Math.round(score))));
  const n = pairs.length;
  const diffs = predicted.map((p, i) => p - truth[i]);
  return {
    n,
    exact: diffs.filter((d) => d === 0).length / n,
    adjacent: diffs.filter((d) => Math.abs(d) <= 1).length / n,
    mae: diffs.reduce((a, d) => a + Math.abs(d), 0) / n,
    /** Root mean square distance between the (unrounded) score and the human level. */
    rmse: Math.sqrt(pairs.reduce((a, [l, score]) => a + (score - levelIndex(l)) ** 2, 0) / n),
    bias: diffs.reduce((a, d) => a + d, 0) / n,
    spearman: spearman(truth, pairs.map(([, s]) => s)),
  };
}

function printMatrix(pairs: [Label, CefrLevel][]) {
  const table: Record<string, Record<string, number | string>> = {};
  for (const truth of LABELS) {
    const row = pairs.filter(([t]) => t === truth);
    if (row.length === 0) continue;
    table[`${truth} (${row.length})`] = Object.fromEntries(
      CEFR_LEVELS.map((p) => [`→${p}`, row.filter(([, got]) => got === p).length || ""]),
    );
  }
  console.log("Confusion matrix (rows: human level, columns: estimate):");
  console.table(table);
}

function medianMeasures(rows: { bundle: Bundle; measures: ReturnType<typeof measureLevel> }[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const level of LABELS) {
    const list = rows.filter((r) => r.bundle.level === level).map((r) => r.measures);
    if (list.length === 0) continue;
    out[level] = {
      errorRate: +median(list.map((m) => m.errorRate)).toFixed(2),
      grammar: +median(list.map((m) => m.grammar)).toFixed(2),
      sentenceLength: +median(list.map((m) => m.sentenceLength)).toFixed(1),
      subordination: +median(list.map((m) => m.subordination)).toFixed(2),
      mattr: +median(list.map((m) => m.mattr)).toFixed(3),
      longWords: +median(list.map((m) => m.longWords)).toFixed(3),
    };
  }
  return out;
}

/**
 * Runs a few essays (spread across levels, from the dev split) through the
 * app's real analysis and compares the mistakes it counts with the corpus'
 * corrections that eval:level counts.
 */
async function compareWithApp(spec: string) {
  // Settings and API keys come from the database in DATABASE_PATH; read it from .env.local like the app does.
  if (!process.env.DATABASE_PATH && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { analyzeMessage } = await import("../../src/lib/ai/analyze");
  const { errorToMessage } = await import("../../src/lib/ai/fallback");
  const { PROVIDER_IDS } = await import("../../src/lib/ai/provider-info");
  const { getSettings } = await import("../../src/lib/settings");
  type ProviderId = (typeof PROVIDER_IDS)[number];

  const limit = Number(option("limit") ?? 24);
  const delayMs = Number(option("delay") ?? 4000);
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  if (!PROVIDER_IDS.includes(provider as ProviderId) || !model) {
    console.error(`Invalid spec "${spec}". Use <provider>:<model>, e.g. gemini:gemini-flash-lite-latest`);
    process.exit(1);
  }
  const base = getSettings();
  const settings = { ...base, provider: provider as ProviderId, models: { ...base.models, [provider]: model }, fallbacks: [] };

  // The same essays every time: every k-th dev essay of each level, 80–400 words.
  const perLevel = Math.ceil(limit / CEFR_LEVELS.length);
  const sample = CEFR_LEVELS.flatMap((level) => {
    const list = essays
      .filter((e) => e.split === "dev" && e.level === level && countWords(e.text) >= 60 && countWords(e.text) <= 400)
      .sort((a, b) => a.id.localeCompare(b.id));
    const step = Math.max(1, Math.floor(list.length / perLevel));
    return list.filter((_, i) => i % step === 0).slice(0, perLevel);
  }).slice(0, limit);

  const cacheFile = path.join(resultsDir, "level-analysis-cache.json");
  const cache: Record<string, { counted: number; typos: number; suggestions: number; errors: unknown[] }> = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    : {};
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let requests = 0;
  for (const essay of sample) {
    const key = `${spec}|${essay.id}`;
    if (cache[key]) continue;
    if (provider !== "ollama" && requests > 0) await sleep(delayMs);
    requests++;
    try {
      const { analysis } = await analyzeMessage({ text: essay.text, mode: "correction", history: [] }, settings);
      const stored = analysis.errors.map((e) => ({ severity: e.severity, category: e.category, inputMode: "typed" as const }));
      cache[key] = {
        counted: stored.filter((e) => countsInStats(e, false)).length,
        typos: stored.filter((e) => e.severity === "typo").length,
        suggestions: stored.filter((e) => e.severity === "suggestion").length,
        errors: analysis.errors.map((e) => [e.original, e.correction, e.category, e.severity]),
      };
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      console.log(`  ${essay.level} ${essay.id}: ${cache[key].counted} counted (corpus: ${countedEdits(essay)})`);
    } catch (error) {
      console.log(`  FAIL ${essay.id}: ${errorToMessage(error)}`);
    }
  }

  const table: Record<string, Record<string, number | string>> = {};
  const all = { words: 0, app: 0, corpus: 0, corpusAll: 0 };
  for (const level of CEFR_LEVELS) {
    const done = sample.filter((e) => e.level === level && cache[`${spec}|${e.id}`]);
    if (done.length === 0) continue;
    const words = done.reduce((n, e) => n + countWords(e.text), 0);
    const app = done.reduce((n, e) => n + cache[`${spec}|${e.id}`].counted, 0);
    const corpus = done.reduce((n, e) => n + countedEdits(e), 0);
    const corpusAll = done.reduce((n, e) => n + e.edits.length, 0);
    Object.assign(all, { words: all.words + words, app: all.app + app, corpus: all.corpus + corpus, corpusAll: all.corpusAll + corpusAll });
    table[`${level} (${done.length})`] = {
      words,
      "app /100w": +((app / words) * 100).toFixed(1),
      "corpus counted /100w": +((corpus / words) * 100).toFixed(1),
      "corpus all /100w": +((corpusAll / words) * 100).toFixed(1),
      "app ÷ corpus": corpus ? +(app / corpus).toFixed(2) : "-",
    };
  }
  table[`all`] = {
    words: all.words,
    "app /100w": +((all.app / all.words) * 100).toFixed(1),
    "corpus counted /100w": +((all.corpus / all.words) * 100).toFixed(1),
    "corpus all /100w": +((all.corpusAll / all.words) * 100).toFixed(1),
    "app ÷ corpus": +(all.app / all.corpus).toFixed(2),
  };
  console.log(`\nMistakes counted by ${spec} vs the corpus' corrections (${requests} new requests):`);
  console.table(table);
  const file = path.join(resultsDir, `level-analyze-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ spec, table }, null, 1));
  console.log(`Saved to ${path.relative(process.cwd(), file)}`);
}

function countedEdits(essay: Essay) {
  return essay.edits.map((edit) => toCorrection(essay.id, edit)).filter((c) => countsInStats(c, countTypos)).length;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function spearman(a: number[], b: number[]) {
  const rank = (values: number[]) => {
    const order = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
    const ranks = new Array<number>(values.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return ranks;
  };
  const ra = rank(a);
  const rb = rank(b);
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
