/** Text measures and score interpolation for the level estimate (pure, see level-core.ts). */

/** Moving-average type-token ratio: the share of different words in every window of `size` words. */
export function mattr(tokens: string[], size = 50): number {
  if (tokens.length === 0) return 0;
  if (tokens.length <= size) return new Set(tokens).size / tokens.length;
  const counts = new Map<string, number>();
  for (let i = 0; i < size; i++) counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
  let total = counts.size / size;
  for (let i = size; i < tokens.length; i++) {
    const out = tokens[i - size];
    const n = counts.get(out)! - 1;
    if (n === 0) counts.delete(out);
    else counts.set(out, n);
    counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
    total += counts.size / size;
  }
  return total / (tokens.length - size + 1);
}

/** Removes code, URLs, paths and [Spanish lookups], which aren't the learner's English. */
export function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bhttps?:\/\/\S+/g, " ")
    .replace(/\S*[/\\]\S*/g, " ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lowercase English words; tokens with digits, underscores or other symbols (identifiers) are dropped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/[\s,;:!?.()"“”…]+/)
    .filter((t) => /^[a-z]+(?:['-][a-z]+)*$/.test(t));
}

/** Score from 1 to 6 for a value that grows with the level. */
export function scoreIncreasing(value: number, anchors: readonly number[]): number {
  if (value <= anchors[0]) return 1;
  for (let i = 1; i < anchors.length; i++) {
    if (value <= anchors[i]) return i + (value - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
  }
  return anchors.length;
}

/** Score from 1 to 6 for a value that shrinks as the level grows (mistakes). */
export function scoreDecreasing(value: number, anchors: readonly number[]): number {
  return scoreIncreasing(
    -value,
    anchors.map((a) => -a),
  );
}
