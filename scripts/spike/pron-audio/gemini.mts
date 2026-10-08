/**
 * SPIKE (#74): sends each clip of the synthetic set to Gemini with the text
 * that was read, and scores what it reports against the known errors.
 *
 *   pnpm tsx scripts/spike/pron-audio/gemini.mts [models...] [--mode=feedback|probe] [--voice=am_michael] [--delay=4000]
 *
 * Modes:
 *   feedback  open question: list the pronunciation problems (fixed categories)
 *             and an accent score. What a "pronunciation feedback" feature would ask.
 *   probe     closed question about the target word: which syllable was stressed,
 *             and were the unstressed vowels reduced? What a read-aloud check
 *             on known words would ask.
 *
 * The key comes from the app's settings (DATABASE_PATH) or .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { shortReason } from "../../../src/lib/ai/fallback";
import { resolveApiKey } from "../../../src/lib/secrets";
import { type Clip, CLIPS, SPIKE_CATEGORIES, SPIKE_DIR } from "./clips";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const mode = flag("mode") ?? "feedback";
const voice = flag("voice") ?? "am_michael";
const delayMs = Number(flag("delay") ?? 4000);
const only = flag("only");
let models = args.filter((a) => !a.startsWith("--"));
if (models.length === 0) models = ["gemini-flash-lite-latest", "gemini-flash-latest"];

const key = resolveApiKey("gemini")?.key;
if (!key) {
  console.error("No Gemini API key: add it in Settings (DATABASE_PATH) or .env.local.");
  process.exit(1);
}
const google = createGoogleGenerativeAI({ apiKey: key });

const feedbackSchema = z.object({
  issues: z.array(
    z.object({
      word: z.string().describe("The word as written in the text"),
      category: z.enum(SPIKE_CATEGORIES),
      detail: z.string().describe("What was heard, briefly"),
    }),
  ),
  accentScore: z.number().describe("1 = very strong foreign accent, 5 = sounds native"),
});

const probeSchema = z.object({
  stressedSyllable: z.number().describe("1-based index of the syllable the speaker stressed"),
  reducedVowels: z.boolean().describe("true if the unstressed vowels were reduced to schwa, false if pronounced as full vowels"),
  heard: z.string().describe("How the word sounded, e.g. in IPA or respelling"),
});

function feedbackPrompt(clip: Clip) {
  return `A Spanish-speaking English learner read this text aloud: "${clip.text}"

Listen to the audio and report the pronunciation problems you can clearly hear: wrong sounds, word stress on the wrong syllable, unstressed vowels pronounced as full vowels instead of schwa (including weak forms like "to", "a", "the"). Use only these categories: ${SPIKE_CATEGORIES.join(", ")}.
Only report problems you are confident about. If the pronunciation is fine, return an empty list. Also rate the accent from 1 (very strong) to 5 (sounds native).`;
}

function probePrompt(clip: Clip) {
  return `A Spanish-speaking English learner read this text aloud: "${clip.text}"

Listen only to the word "${clip.word}" (syllables: ${clip.syllables!.join("-")}). Which syllable did the speaker actually stress (not which one should be stressed)? Were its unstressed vowels reduced to schwa, or pronounced as full vowels?`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clips = CLIPS.filter((c) => (mode === "probe" ? c.word && c.word !== "to" : true)).filter((c) => !only || c.id.startsWith(only));
const summary: Record<string, string | number>[] = [];
const details: unknown[] = [];

for (const modelId of models) {
  console.log(`\n▶ ${modelId} · ${mode} · ${voice}`);
  const results: { clip: Clip; output: z.infer<typeof feedbackSchema> | z.infer<typeof probeSchema> }[] = [];
  const times: number[] = [];
  let failures = 0;

  for (const [i, clip] of clips.entries()) {
    if (i > 0) await sleep(delayMs);
    const audio = fs.readFileSync(path.join(SPIKE_DIR, `${voice}--${clip.id}.wav`));
    const started = Date.now();
    try {
      const result = await generateText({
        model: google(modelId),
        temperature: 0,
        maxRetries: 3,
        abortSignal: AbortSignal.timeout(90_000),
        output: Output.object<z.infer<typeof feedbackSchema> | z.infer<typeof probeSchema>>({
          schema: (mode === "probe" ? probeSchema : feedbackSchema) as z.ZodType<
            z.infer<typeof feedbackSchema> | z.infer<typeof probeSchema>
          >,
        }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: mode === "probe" ? probePrompt(clip) : feedbackPrompt(clip) },
              { type: "file", data: audio, mediaType: "audio/wav" },
            ],
          },
        ],
      });
      times.push(Date.now() - started);
      results.push({ clip, output: result.output });
      details.push({ modelId, mode, voice, clip: clip.id, variant: clip.variant, output: result.output, usage: result.usage });
      console.log(`  ${clip.id.padEnd(22)} ${JSON.stringify(result.output).slice(0, 160)}`);
    } catch (error) {
      failures++;
      details.push({ modelId, mode, voice, clip: clip.id, error: String(error) });
      console.log(`  ${clip.id.padEnd(22)} FAIL ${shortReason(error)}`);
    }
  }

  const avgSeconds = times.length ? +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : "-";
  if (mode === "probe") {
    const probes = results as { clip: Clip; output: z.infer<typeof probeSchema> }[];
    const by = (variant: string, test: (r: (typeof probes)[number]) => boolean) => {
      const subset = probes.filter((r) => r.clip.variant === variant);
      return `${subset.filter(test).length}/${subset.length}`;
    };
    const stressRight = (r: (typeof probes)[number]) => r.output.stressedSyllable - 1 === r.clip.stressed;
    const reducedRight = (r: (typeof probes)[number]) => r.output.reducedVowels === r.clip.reduced;
    summary.push({
      model: modelId,
      stressFound: by("stress", stressRight),
      stressRightOnCorrect: by("ok", stressRight),
      schwaFound: by("schwa", reducedRight),
      reducedRightOnCorrect: by("ok", reducedRight),
      failures,
      avgSeconds,
    });
  } else {
    const feedback = results as { clip: Clip; output: z.infer<typeof feedbackSchema> }[];
    const onWord = (r: (typeof feedback)[number]) =>
      r.output.issues.filter((i) => i.word.toLowerCase().replace(/[^a-z]/g, "") === r.clip.word);
    const found = (variant: string) => {
      const subset = feedback.filter((r) => r.clip.variant === variant);
      const hits = subset.filter((r) => onWord(r).some((i) => r.clip.expected.includes(i.category)));
      return `${hits.length}/${subset.length}`;
    };
    const correct = feedback.filter((r) => r.clip.variant === "ok");
    const accent = feedback.filter((r) => r.clip.variant === "accent");
    const accentRecall = accent.map((r) => r.clip.expected.filter((c) => r.output.issues.some((i) => i.category === c)).length);
    const avgScore = (rs: typeof feedback) => +(rs.reduce((a, r) => a + r.output.accentScore, 0) / (rs.length || 1)).toFixed(1);
    summary.push({
      model: modelId,
      stressFound: found("stress"),
      schwaFound: found("schwa"),
      correctWithIssueOnWord: `${correct.filter((r) => r.clip.word && onWord(r).length > 0).length}/${correct.filter((r) => r.clip.word).length}`,
      issuesPerCorrectClip: +(correct.reduce((a, r) => a + r.output.issues.length, 0) / (correct.length || 1)).toFixed(1),
      accentCategoriesFound: `${accentRecall.reduce((a, b) => a + b, 0)}/${accent.reduce((a, r) => a + r.clip.expected.length, 0)}`,
      scoreCorrect: avgScore(correct),
      scoreWrong: avgScore(feedback.filter((r) => r.clip.variant !== "ok")),
      failures,
      avgSeconds,
    });
  }
}

console.table(summary);
const outDir = path.resolve(".eval-results");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `pron-gemini-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ summary, details }, null, 1));
console.log(`Details saved to ${path.relative(process.cwd(), out)}`);
