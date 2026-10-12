"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AccuracyPoint } from "@/lib/read-aloud-core";

type Point = AccuracyPoint & { percent: number | null };

/** Read-aloud accuracy over time: % of words heard as written per day (or week). */
export function AccuracyChart({ data }: { data: AccuracyPoint[] }) {
  // Days without readings have no accuracy: leave a gap instead of plotting a fake 0.
  const points: Point[] = data.map((d) => ({
    ...d,
    percent: d.accuracy === null ? null : Math.round(d.accuracy * 100),
  }));

  if (points.filter((p) => p.percent !== null).length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Read aloud on at least two different days (or weeks, for long periods) to see your accuracy over time.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
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
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
        />
        <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<AccuracyTooltip />} />
        <Line
          type="linear"
          dataKey="percent"
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

function AccuracyTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{formatDate(p.bucket)}</div>
      {p.percent !== null ? (
        <>
          <div>
            <span className="font-medium tabular-nums">{p.percent}%</span>{" "}
            <span className="text-muted-foreground">of words heard as written</span>
          </div>
          <div className="text-muted-foreground">
            {p.words} words in {p.readings} {p.readings === 1 ? "reading" : "readings"}
          </div>
        </>
      ) : (
        <div className="text-muted-foreground">No readings</div>
      )}
    </div>
  );
}

function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
