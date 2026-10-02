/**
 * Loads CEFR-labelled learner writing for `pnpm eval:level`.
 *
 * Corpus: Cambridge English Write & Improve + LOCNESS (BEA-2019 release,
 * v2.1), https://www.cl.cam.ac.uk/research/nl/bea2019st/ — essays, letters
 * and stories by learners, each with a CEFR level (A1.i … C2.ii) given by
 * W&I annotators and character-level corrections. Licensed for
 * non-commercial research and educational use only, so it is NOT in the
 * repo: download it into the gitignored `data/` folder:
 *
 *   mkdir -p data/cefr && curl -L https://www.cl.cam.ac.uk/research/nl/bea2019st/data/wi+locness_v2.1.bea19.tar.gz | tar xz -C data/cefr
 *
 * Citation: Yannakoudakis, Andersen, Geranpayeh, Briscoe and Nicholls. 2018.
 * Developing an automated writing placement system for ESL learners.
 * Applied Measurement in Education 31:3.
 */
import fs from "node:fs";
import path from "node:path";
import { CEFR_LEVELS, type CefrLevel } from "../../src/lib/insights/level-core";

export const DEFAULT_CORPUS_DIR = "data/cefr/wi+locness";

/** How a W&I correction would probably be treated by the app. */
export type EditKind = "grammar" | "spelling" | "mechanics";

export interface Edit {
  original: string;
  /** Null when the annotator only marked the fragment as wrong. */
  correction: string | null;
  kind: EditKind;
}

export interface Essay {
  id: string;
  userId: string;
  /** "A1".."C2", or "N" for the native LOCNESS essays. */
  level: CefrLevel | "N";
  fineLevel: string;
  split: "train" | "dev";
  text: string;
  correctedText: string;
  edits: Edit[];
}

interface RawEssay {
  id: string;
  userid?: string;
  cefr: string;
  text: string;
  edits: [number, [number, number, string | null][]][];
}

export function loadEssays(dir = DEFAULT_CORPUS_DIR): Essay[] {
  const jsonDir = path.join(dir, "json");
  if (!fs.existsSync(jsonDir)) {
    throw new Error(
      `No corpus in ${jsonDir}. Download it with:\n  mkdir -p data/cefr && curl -L https://www.cl.cam.ac.uk/research/nl/bea2019st/data/wi+locness_v2.1.bea19.tar.gz | tar xz -C data/cefr`,
    );
  }
  const essays: Essay[] = [];
  for (const file of fs.readdirSync(jsonDir).filter((f) => f.endsWith(".json")).sort()) {
    const split = file.includes(".dev.") ? "dev" : "train";
    for (const line of fs.readFileSync(path.join(jsonDir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line) as RawEssay;
      const level = raw.cefr === "N" ? "N" : (raw.cefr.slice(0, 2) as CefrLevel);
      if (level !== "N" && !CEFR_LEVELS.includes(level)) continue;
      // Some essays have several annotators; the first one is used, as in the BEA-2019 M2 files.
      const spans = [...(raw.edits[0]?.[1] ?? [])].sort((a, b) => a[0] - b[0]);
      essays.push({
        id: raw.id,
        userId: raw.userid ?? `native-${raw.id}`,
        level,
        fineLevel: raw.cefr,
        split,
        text: raw.text,
        correctedText: applyEdits(raw.text, spans),
        edits: spans.map(([start, end, correction]) => {
          const original = raw.text.slice(start, end);
          return { original, correction, kind: classifyEdit(original, correction) };
        }),
      });
    }
  }
  return essays;
}

function applyEdits(text: string, spans: [number, number, string | null][]): string {
  let out = "";
  let at = 0;
  for (const [start, end, correction] of spans) {
    if (start < at) continue; // overlapping edits: keep the first
    out += text.slice(at, start) + (correction ?? text.slice(start, end));
    at = end;
  }
  return out + text.slice(at);
}

/**
 * Rough guess of what the app would do with each correction:
 * - mechanics: only punctuation, spacing or capitals change (mostly optional
 *   commas, which the app shows as suggestions);
 * - spelling: one word for a similar-looking word that isn't an inflection of
 *   it ("resaon" → "reason"), which the app usually calls a typo;
 * - grammar: everything else (word choice, tenses, articles, prepositions…).
 */
export function classifyEdit(original: string, correction: string | null): EditKind {
  if (correction === null) return "grammar";
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (letters(original) === letters(correction)) return "mechanics";
  const a = original.trim().toLowerCase();
  const b = correction.trim().toLowerCase();
  if (/^[a-z]+$/.test(a) && /^[a-z]+$/.test(b) && !isInflection(a, b)) {
    const distance = levenshtein(a, b);
    if (distance <= (Math.max(a.length, b.length) <= 5 ? 1 : 2) && a[0] === b[0]) return "spelling";
  }
  return "grammar";
}

const SUFFIXES = ["s", "es", "ed", "d", "ing", "ly", "er", "est", "ies", "ied"];

function isInflection(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const stem = short.replace(/[ey]$/, "");
  return SUFFIXES.some((s) => long === short + s || long === stem + s || long === short + short.slice(-1) + s);
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export interface Bundle {
  id: string;
  level: CefrLevel | "N";
  split: "train" | "dev";
  essays: Essay[];
}

/**
 * Joins essays of the same level into "learners" of about `targetWords`
 * words, since the estimate needs at least 300 and the app usually sees
 * more. Essays are sorted by user, so a bundle is mostly one person's writing.
 */
export function bundleEssays(essays: Essay[], targetWords: number, countWords: (text: string) => number): Bundle[] {
  const groups = new Map<string, Essay[]>();
  for (const e of essays) {
    const key = `${e.split}/${e.level}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const bundles: Bundle[] = [];
  for (const [key, list] of [...groups.entries()].sort()) {
    const [split, level] = key.split("/") as [Bundle["split"], Bundle["level"]];
    list.sort((a, b) => a.userId.localeCompare(b.userId) || a.id.localeCompare(b.id));
    let current: Essay[] = [];
    let words = 0;
    for (const e of list) {
      current.push(e);
      words += countWords(e.text);
      if (words >= targetWords) {
        bundles.push({ id: `${key}/${bundles.length}`, level, split, essays: current });
        current = [];
        words = 0;
      }
    }
    // A short remainder is dropped: it would be a smaller, noisier "learner".
  }
  return bundles;
}
