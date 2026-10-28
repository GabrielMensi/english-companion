import type { Analysis } from "../../src/lib/ai/analysis";
import type { Sample } from "./samples";

export interface SampleScore {
  /** Points earned and possible: one per detected fragment, applied fix, typo label and Spanish lookup. */
  points: number;
  possible: number;
  missed: string[];
  /** Errors reported on sentences that have no mistakes. */
  falsePositives: number;
  /** Discarded fragments (`forbidden`) that the model reported again. */
  repeatedDiscards: number;
}

const lower = (s: string) => s.toLowerCase();

function overlaps(a: string, b: string) {
  const x = lower(a).trim();
  const y = lower(b).trim();
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

export function scoreSample(sample: Sample, analysis: Analysis): SampleScore {
  let points = 0;
  let possible = 0;
  const missed: string[] = [];
  const corrected = lower(analysis.correctedText);

  for (const e of sample.expect) {
    const match = analysis.errors.find((err) => overlaps(err.original, e.fragment));
    possible++;
    if (match) points++;
    else missed.push(`not flagged: "${e.fragment}"`);

    if (e.fix) {
      possible++;
      if (corrected.includes(lower(e.fix))) points++;
      else missed.push(`not fixed: "${e.fix}"`);
    }
    if (e.typo) {
      possible++;
      if (match?.severity === "typo") points++;
      else missed.push(`not a typo: "${e.fragment}"`);
    }
  }

  for (const word of sample.spanish ?? []) {
    possible++;
    if (analysis.spanishPhrases.some((p) => overlaps(p.spanish, word))) points++;
    else missed.push(`no translation: "${word}"`);
  }

  // Each fragment the learner discarded earns a point if the model leaves it alone (suggestions count too).
  let repeatedDiscards = 0;
  for (const fragment of sample.forbidden ?? []) {
    possible++;
    if (analysis.errors.some((err) => overlaps(err.original, fragment))) {
      repeatedDiscards++;
      missed.push(`reported a discarded correction: "${fragment}"`);
    } else points++;
  }

  // A sentence without mistakes is worth one point if nothing is flagged. Discarded samples may
  // contain other real mistakes, so only the discarded fragments are scored there.
  const clean = sample.expect.length === 0 && !sample.forbidden?.length;
  // Suggestions are optional improvements, not mistakes, so they don't count.
  const mistakes = analysis.errors.filter((e) => e.severity !== "suggestion");
  const falsePositives = clean ? mistakes.length : 0;
  if (clean) {
    possible++;
    if (falsePositives === 0) points++;
    else missed.push(`false positives: ${mistakes.map((e) => `"${e.original}"`).join(", ")}`);
  }

  return { points, possible, missed, falsePositives, repeatedDiscards };
}
