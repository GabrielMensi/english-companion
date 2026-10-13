"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CategoryStat } from "@/lib/stats-core";
import { categoryLabel, type Severity, SEVERITY_LABELS } from "@/lib/taxonomy";

// Typos are excluded: they are not a learning signal.
const SERIES: Severity[] = ["minor", "moderate", "major"];
const COLOR: Record<Severity, string> = {
  suggestion: "var(--muted-foreground)",
  typo: "var(--muted-foreground)",
  minor: "var(--viz-sev-minor)",
  moderate: "var(--viz-sev-moderate)",
  major: "var(--viz-sev-major)",
};

export function CategoryChart({ categories }: { categories: CategoryStat[] }) {
  const data = categories.slice(0, 8).map((c) => ({
    name: categoryLabel(c.category),
    minor: c.bySeverity.minor,
    moderate: c.bySeverity.moderate,
    major: c.bySeverity.major,
    total: c.bySeverity.minor + c.bySeverity.moderate + c.bySeverity.major,
  }));

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No mistakes in this period 🎉</p>;
  }

  return (
    <div className="space-y-3">
      <Legend />
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--muted-foreground)"
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<CategoryTooltip />} />
          {SERIES.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="severity"
              fill={COLOR[s]}
              // 2px surface gap between stacked segments.
              stroke="var(--card)"
              strokeWidth={2}
              radius={i === SERIES.length - 1 ? [0, 4, 4, 0] : 0}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-muted-foreground">
      {SERIES.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COLOR[s] }} />
          {SEVERITY_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { name: string; total: number } & Record<Severity, number> }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{row.name}</div>
      {SERIES.filter((s) => row[s] > 0).map((s) => (
        <div key={s} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-sm" style={{ background: COLOR[s] }} />
            {SEVERITY_LABELS[s]}
          </span>
          <span className="tabular-nums">{row[s]}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t pt-1">
        <span className="text-muted-foreground">Total</span>
        <span className="font-medium tabular-nums">{row.total}</span>
      </div>
    </div>
  );
}
