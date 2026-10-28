import { diffWordsWithSpace } from "diff";
import { type Severity, SEVERITIES } from "@/lib/taxonomy";

/** What the marks need from a correction. */
export interface MarkableCorrection {
  id: string;
  original: string;
  correction: string;
  severity: Severity;
  category: string;
}

export interface DiffSegment {
  /**
   * "flagged": unchanged text that a correction points at, when the model
   * listed the mistake but forgot to fix it in the corrected text.
   */
  kind: "same" | "added" | "removed" | "flagged";
  value: string;
  /** Reference numbers shown after this segment: the mistakes this change belongs to. */
  notes: number[];
}

export interface MarkedDiff {
  segments: DiffSegment[];
  /** Reference number of each correction found in the text, numbered left to right. */
  numbers: Map<string, number>;
}

interface Chunk {
  /** Indexes into the segment list: consecutive removed/added parts. */
  first: number;
  last: number;
  /** Where the chunk starts in the original text and in the corrected text. */
  fromStart: number;
  toStart: number;
}

interface Flag {
  /** Index of the "same" segment that holds it, and its range in the original text. */
  segment: number;
  start: number;
  end: number;
}

/**
 * Word diff between the learner's text and the correction, with each change
 * linked to the correction it comes from, so the text can carry reference
 * numbers that point at the explanation. A correction is anchored where its
 * `original` appears in the learner's text (or its `correction` in the
 * corrected text). When the model listed a mistake but didn't apply it to the
 * corrected text, its `original` is flagged in the unchanged text instead; one
 * that can't be found at all just gets no number.
 */
export function markDiff(from: string, to: string, corrections: MarkableCorrection[]): MarkedDiff {
  const segments: DiffSegment[] = [];
  const segmentStarts: number[] = [];
  const chunks: Chunk[] = [];
  let fromPos = 0;
  let toPos = 0;
  let open: Chunk | null = null;

  for (const part of diffWordsWithSpace(from, to)) {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    const index = segments.length;
    segments.push({ kind, value: part.value, notes: [] });
    segmentStarts.push(fromPos);
    if (kind === "same") {
      open = null;
    } else if (open) {
      open.last = index;
    } else {
      open = { first: index, last: index, fromStart: fromPos, toStart: toPos };
      chunks.push(open);
    }
    if (kind !== "added") fromPos += part.value.length;
    if (kind !== "removed") toPos += part.value.length;
  }

  const lowerFrom = from.toLowerCase();
  const lowerTo = to.toLowerCase();
  const used = new Set<Chunk>();
  const flags: Flag[] = [];
  const anchors: { id: string; at: number; chunk?: Chunk; flag?: Flag }[] = [];

  for (const c of corrections) {
    const chunk =
      findChunk(lowerFrom, c.original, chunks, used, "fromStart") ??
      findChunk(lowerTo, c.correction, chunks, used, "toStart");
    if (chunk) {
      used.add(chunk);
      anchors.push({ id: c.id, at: chunk.fromStart, chunk });
      continue;
    }
    const flag = findFlag(lowerFrom, c.original, segments, segmentStarts, flags);
    if (flag) {
      flags.push(flag);
      anchors.push({ id: c.id, at: flag.start, flag });
    }
  }

  anchors.sort((a, b) => a.at - b.at);
  const numbers = new Map<string, number>();
  const flagNotes = new Map<Flag, number>();
  anchors.forEach(({ id, chunk, flag }, i) => {
    numbers.set(id, i + 1);
    if (chunk) segments[chunk.last].notes.push(i + 1);
    if (flag) flagNotes.set(flag, i + 1);
  });
  if (flags.length === 0) return { segments, numbers };

  // Split the unchanged segments around the flagged fragments.
  const split: DiffSegment[] = [];
  segments.forEach((segment, index) => {
    const inside = flags.filter((f) => f.segment === index).sort((a, b) => a.start - b.start);
    if (inside.length === 0) {
      split.push(segment);
      return;
    }
    let cursor = 0;
    for (const flag of inside) {
      const start = flag.start - segmentStarts[index];
      const end = flag.end - segmentStarts[index];
      if (start > cursor) split.push({ kind: "same", value: segment.value.slice(cursor, start), notes: [] });
      split.push({ kind: "flagged", value: segment.value.slice(start, end), notes: [flagNotes.get(flag)!] });
      cursor = end;
    }
    if (cursor < segment.value.length) split.push({ kind: "same", value: segment.value.slice(cursor), notes: [] });
  });
  return { segments: split, numbers };
}

/** A whole-word occurrence of `needle` inside one unchanged segment, not overlapping another flag. */
function findFlag(
  text: string,
  needle: string,
  segments: DiffSegment[],
  segmentStarts: number[],
  flags: Flag[],
): Flag | null {
  const target = needle.trim().toLowerCase();
  if (!target) return null;
  for (let at = text.indexOf(target); at !== -1; at = text.indexOf(target, at + 1)) {
    const end = at + target.length;
    if (isWordChar(text[at - 1]) && isWordChar(target[0])) continue;
    if (isWordChar(text[end]) && isWordChar(target[target.length - 1])) continue;
    if (flags.some((f) => at < f.end && end > f.start)) continue;
    const segment = segments.findIndex(
      (s, i) => s.kind === "same" && segmentStarts[i] <= at && end <= segmentStarts[i] + s.value.length,
    );
    if (segment !== -1) return { segment, start: at, end };
  }
  return null;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}']/u.test(char);
}

/** The first unused change inside an occurrence of `needle` in `text`. */
function findChunk(
  text: string,
  needle: string,
  chunks: Chunk[],
  used: Set<Chunk>,
  key: "fromStart" | "toStart",
): Chunk | null {
  const target = needle.trim().toLowerCase();
  if (!target) return null;
  for (let at = text.indexOf(target); at !== -1; at = text.indexOf(target, at + 1)) {
    const end = at + target.length;
    const chunk = chunks.find((c) => !used.has(c) && c[key] >= at && c[key] <= end);
    if (chunk) return chunk;
  }
  return null;
}

const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<Severity, number>;

export interface MistakeGroup<C extends MarkableCorrection> {
  category: string;
  items: C[];
  /** The most serious severity in the group. */
  top: Severity;
}

/**
 * Mistakes grouped by category, most serious first: the groups by their worst
 * mistake (then size), and the mistakes inside a group by severity, keeping
 * text order for ties.
 */
export function groupMistakes<C extends MarkableCorrection>(mistakes: C[]): MistakeGroup<C>[] {
  const groups = new Map<string, C[]>();
  for (const m of mistakes) groups.set(m.category, [...(groups.get(m.category) ?? []), m]);
  return [...groups.entries()]
    .map(([category, items]) => {
      const sorted = items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => SEVERITY_RANK[b.item.severity] - SEVERITY_RANK[a.item.severity] || a.i - b.i)
        .map(({ item }) => item);
      return { category, items: sorted, top: sorted[0].severity };
    })
    .sort((a, b) => SEVERITY_RANK[b.top] - SEVERITY_RANK[a.top] || b.items.length - a.items.length);
}
