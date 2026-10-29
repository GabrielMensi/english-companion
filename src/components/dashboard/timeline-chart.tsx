"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Stats } from "@/lib/stats-core";

type Point = Stats["timeline"][number] & { rate: number | null };

export function TimelineChart({ data }: { data: Stats["timeline"] }) {
  // Days without writing have no rate: leave a gap instead of plotting a fake 0.
  const points: Point[] = data.map((d) => ({ ...d, rate: d.words > 0 ? d.per100Words : null }));

  if (points.filter((p) => p.rate !== null).length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Write on at least two different days to see your progress.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="bucket"
          tickFormatter={formatDate}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<TimelineTooltip />} />
        <Line
          type="linear"
          dataKey="rate"
          stroke="var(--viz-series)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--viz-series)", stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{formatDate(p.bucket)}</div>
      {p.words > 0 ? (
        <>
          <div>
            <span className="font-medium tabular-nums">{p.per100Words}</span>{" "}
            <span className="text-muted-foreground">mistakes / 100 words</span>
          </div>
          <div className="text-muted-foreground">
            {p.errors} mistakes in {p.words} words
          </div>
        </>
      ) : (
        <div className="text-muted-foreground">No activity</div>
      )}
    </div>
  );
}

function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
