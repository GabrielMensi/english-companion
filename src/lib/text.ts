/** Counts the words the learner actually wrote, ignoring code. */
export function countWords(text: string): number {
  const withoutCode = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const words = withoutCode.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return words?.length ?? 0;
}

export function makeTitle(text: string, max = 48): string {
  const firstLine = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  if (firstLine.length <= max) return firstLine || "New chat";
  const cut = firstLine.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max / 2 ? lastSpace : max)}…`;
}
