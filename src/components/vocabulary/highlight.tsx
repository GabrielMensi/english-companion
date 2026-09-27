/** Renders `text` with the first occurrence of any of `terms` highlighted. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const lower = text.toLowerCase();
  for (const term of terms) {
    const i = term ? lower.indexOf(term.toLowerCase()) : -1;
    if (i >= 0) {
      return (
        <>
          {text.slice(0, i)}
          <mark className="rounded-sm bg-emerald-500/15 px-0.5 text-emerald-700 dark:text-emerald-400">
            {text.slice(i, i + term.length)}
          </mark>
          {text.slice(i + term.length)}
        </>
      );
    }
  }
  return <>{text}</>;
}
