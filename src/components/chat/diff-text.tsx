import { diffWordsWithSpace } from "diff";

/** Inline word diff: removed words struck through in red, added words in green. */
export function DiffText({ from, to }: { from: string; to: string }) {
  const parts = diffWordsWithSpace(from, to);
  return (
    <p className="font-serif text-reading whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <ins key={i} className="rounded-sm bg-mark-right/12 px-0.5 text-mark-right no-underline">
              {part.value}
            </ins>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className="rounded-sm bg-mark-wrong/10 px-0.5 text-mark-wrong">
              {part.value}
            </del>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}
