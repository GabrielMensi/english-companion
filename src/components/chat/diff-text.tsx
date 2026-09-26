import { diffWordsWithSpace } from "diff";

/** Inline word diff: removed words struck through in red, added words in green. */
export function DiffText({ from, to }: { from: string; to: string }) {
  const parts = diffWordsWithSpace(from, to);
  return (
    <p className="leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <ins key={i} className="rounded-sm bg-emerald-500/15 px-0.5 text-emerald-700 no-underline dark:text-emerald-400">
              {part.value}
            </ins>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className="rounded-sm bg-red-500/10 px-0.5 text-red-600/80 dark:text-red-400/80">
              {part.value}
            </del>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}
