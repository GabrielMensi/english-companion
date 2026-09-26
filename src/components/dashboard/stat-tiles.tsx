import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Stats } from "@/lib/stats-core";

export function StatTiles({ totals }: { totals: Stats["totals"] }) {
  const delta = totals.previousPer100Words === null ? null : totals.per100Words - totals.previousPer100Words;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile label="Errores cada 100 palabras" value={fmt(totals.per100Words)}>
        {delta !== null && Math.abs(delta) >= 0.01 && (
          // Fewer errors is better, so a negative delta is an improvement.
          <span className="flex items-center gap-0.5">
            {delta < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
            {fmt(Math.abs(delta))} {delta < 0 ? "menos" : "más"} que el período anterior
          </span>
        )}
      </Tile>
      <Tile label="Mensajes sin errores" value={`${Math.round(totals.cleanMessagesPct)}%`}>
        {totals.messages} mensajes en total
      </Tile>
      <Tile label="Palabras escritas" value={totals.words.toLocaleString("es-AR")}>
        {totals.errors} errores
      </Tile>
      <Tile label="Typos" value={String(totals.typos)}>
        No cuentan como errores
      </Tile>
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}
