import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { CategoryStat } from "@/lib/stats-core";
import { categoryLabel } from "@/lib/taxonomy";

export function CategoryTable({ categories }: { categories: CategoryStat[] }) {
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin errores en este período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-4 font-normal">Categoría</th>
            <th className="py-2 pr-4 text-right font-normal">Errores</th>
            <th className="py-2 pr-4 text-right font-normal">Graves</th>
            <th className="py-2 pr-4 text-right font-normal">Cada 100 palabras</th>
            <th className="py-2 font-normal">Tendencia</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.category} className="border-b last:border-0">
              <td className="py-2 pr-4">{categoryLabel(c.category)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c.count}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c.bySeverity.major}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{c.per100Words}</td>
              <td className="py-2">
                <Trend value={c.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trend in errors per 100 words: lower is better. Icon + text, never color alone. */
function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(value) < 0.05) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="size-3.5" /> Estable
      </span>
    );
  }
  return value < 0 ? (
    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
      <ArrowDownRight className="size-3.5" /> Mejorando
    </span>
  ) : (
    <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
      <ArrowUpRight className="size-3.5" /> Empeorando
    </span>
  );
}
