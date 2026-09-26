import { ArrowRight } from "lucide-react";
import type { Stats } from "@/lib/stats-core";
import { categoryLabel } from "@/lib/taxonomy";

export function TopMistakes({ mistakes }: { mistakes: Stats["topMistakes"] }) {
  if (mistakes.length === 0) {
    return <p className="text-sm text-muted-foreground">No mistakes in this period.</p>;
  }

  return (
    <ul className="divide-y">
      {mistakes.map((m) => (
        <li key={`${m.category}/${m.subcategory}`} className="flex gap-4 py-3 first:pt-0 last:pb-0">
          <div className="w-10 shrink-0 text-right text-lg font-semibold tabular-nums">{m.count}×</div>
          <div className="min-w-0 space-y-1 text-sm">
            <div>
              <span className="font-medium">{humanize(m.subcategory)}</span>{" "}
              <span className="text-muted-foreground">· {categoryLabel(m.category)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-red-600/90 line-through dark:text-red-400/90">{m.example.original}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="text-emerald-700 dark:text-emerald-400">{m.example.correction}</span>
            </div>
            <p className="text-muted-foreground">{m.example.explanation}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function humanize(snake: string) {
  const text = snake.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
