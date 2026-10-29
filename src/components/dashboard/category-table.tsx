import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { CategoryRow } from "@/components/dashboard/category-row";
import type { CategoryStat } from "@/lib/stats-core";

export function CategoryTable({ categories }: { categories: CategoryStat[] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No mistakes in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-4 font-normal">Category</th>
            <th className="py-2 pr-4 text-right font-normal">Mistakes</th>
            <th className="py-2 pr-4 text-right font-normal">Major</th>
            <th className="py-2 pr-4 text-right font-normal">Per 100 words</th>
            <th className="py-2 pr-4 font-normal">Main types</th>
            <th className="py-2 font-normal">Trend</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <CategoryRow key={c.category} stat={c} trend={<Trend value={c.trend} />} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trend in errors per 100 words: lower is better. Icon + text, never color alone. */
export function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(value) < 0.05) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="size-3.5" /> Stable
      </span>
    );
  }
  return value < 0 ? (
    <span className="flex items-center gap-1 text-mark-right">
      <ArrowDownRight className="size-3.5" /> Improving
    </span>
  ) : (
    <span className="flex items-center gap-1 text-mark-wrong">
      <ArrowUpRight className="size-3.5" /> Getting worse
    </span>
  );
}
