import { ArrowRight } from "lucide-react";
import { DiscardButton } from "@/components/dashboard/discard-button";
import type { Stats } from "@/lib/stats-core";
import { categoryLabel, subtypeLabel } from "@/lib/taxonomy";

export function TopMistakes({ mistakes }: { mistakes: Stats["topMistakes"] }) {
  if (mistakes.length === 0) {
    return <p className="text-sm text-muted-foreground">No mistakes in this period.</p>;
  }

  return (
    <ul className="divide-y">
      {mistakes.map((m) => (
        <li key={`${m.category}/${m.subtype ?? m.subcategory}`} className="flex gap-4 py-3 first:pt-0 last:pb-0">
          <div className="w-10 shrink-0 text-right text-lg font-semibold tabular-nums">{m.count}×</div>
          <div className="min-w-0 space-y-1 text-sm">
            <div>
              <span className="font-medium">{subtypeLabel(m.category, m.subtype) ?? humanize(m.subcategory)}</span>{" "}
              <span className="text-muted-foreground">· {categoryLabel(m.category)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-mark-wrong line-through">{m.example.original}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="text-mark-right">{m.example.correction}</span>
              <DiscardButton
                correctionId={m.exampleId}
                label="Discard this example"
                title="Not a mistake: leave this example out of your stats (the others in the group still count)"
              />
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
