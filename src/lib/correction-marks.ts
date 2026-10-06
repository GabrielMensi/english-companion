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
  kind: "same" | "added" | "removed";
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

/**
 * Word diff between the learner's text and the correction, with each change
 * linked to the correction it comes from, so the text can carry reference
 * numbers that point at the explanation. A correction is anchored where its
 * `original` appears in the learner's text (or its `correction` in the
 * corrected text); one that can't be found just gets no number.
 */
export function markDiff(from: string, to: string, corrections: MarkableCorrection[]): MarkedDiff {
  const segments: DiffSegment[] = [];
  const chunks: Chunk[] = [];
  let fromPos = 0;
  let toPos = 0;
  let open: Chunk | null = null;

  for (const part of diffWordsWithSpace(from, to)) {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    const index = segments.length;
    segments.push({ kind, value: part.value, notes: [] });
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
  const anchors: { id: string; chunk: Chunk }[] = [];

  for (const c of corrections) {
    const chunk =
      findChunk(lowerFrom, c.original, chunks, used, "fromStart") ??
      findChunk(lowerTo, c.correction, chunks, used, "toStart");
    if (!chunk) continue;
    used.add(chunk);
    anchors.push({ id: c.id, chunk });
  }

  anchors.sort((a, b) => a.chunk.fromStart - b.chunk.fromStart);
  const numbers = new Map<string, number>();
  anchors.forEach(({ id, chunk }, i) => {
    numbers.set(id, i + 1);
    segments[chunk.last].notes.push(i + 1);
  });
  return { segments, numbers };
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
