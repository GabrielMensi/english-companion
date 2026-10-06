import { type DiffSegment, markDiff } from "@/lib/correction-marks";

/**
 * Inline word diff: removed words struck through, added words highlighted,
 * and (when given) reference numbers pointing at the explanation of each change.
 */
export function DiffText({ from, to, segments }: { from: string; to: string; segments?: DiffSegment[] }) {
  const parts = segments ?? markDiff(from, to, []).segments;
  return (
    <p className="font-serif text-reading whitespace-pre-wrap">
      {parts.map((part, i) => {
        const notes = part.notes.length > 0 && (
          <sup className="ml-0.5 font-sans text-[0.65em] font-semibold text-muted-foreground tabular-nums">
            {part.notes.join(",")}
          </sup>
        );
        if (part.kind === "added") {
          return (
            <span key={i}>
              <ins className="rounded-sm bg-mark-right/12 px-0.5 text-mark-right no-underline">{part.value}</ins>
              {notes}
            </span>
          );
        }
        if (part.kind === "removed") {
          return (
            <span key={i}>
              <del className="rounded-sm px-0.5 text-mark-wrong decoration-mark-wrong/70">{part.value}</del>
              {notes}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}
