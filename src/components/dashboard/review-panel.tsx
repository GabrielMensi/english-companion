"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ReviewDashboard } from "@/lib/review-stats";
import type { ReviewTimelinePoint } from "@/lib/review-stats-core";

/** Flashcard reviews: what's due, retention, reviews per day and streak. */
export function ReviewPanel({ data }: { data: ReviewDashboard }) {
  const { stats, due, untrackedBefore } = data;
  const since =
    stats.since === null
      ? null
      : new Date(stats.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Due now" value={String(due.dueNow)}>
          {due.newCards > 0 && `${due.newCards} new waiting · `}
          {due.tomorrow} tomorrow · {due.nextWeek} this week
        </Tile>
        <Tile label="Retention" value={stats.retention === null ? "–" : `${Math.round(stats.retention)}%`}>
          {stats.total === 0
            ? "No reviews in this period"
            : `Not graded Again, of ${stats.total} ${stats.total === 1 ? "review" : "reviews"}`}
        </Tile>
        <Tile label="Reviews per day" value={fmt(stats.perDay)}>
          {stats.activeDays} {stats.activeDays === 1 ? "day" : "days"} with reviews
        </Tile>
        <Tile label="Streak" value={`${stats.streak.current} ${stats.streak.current === 1 ? "day" : "days"}`}>
          {stats.streak.current > 0 && !stats.streak.reviewedToday ? "Review today to keep it · " : ""}
          Best: {stats.streak.best}
        </Tile>
      </div>

      {stats.total > 0 && <ReviewChart data={stats.timeline} />}

      <p className="text-xs text-muted-foreground">
        {since === null
          ? "Review history starts with your next review: retention, reviews per day and streak are counted from then on."
          : `Review history starts on ${since}${untrackedBefore ? ": reviews made before that weren’t recorded" : ""}.`}
      </p>
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function ReviewChart({ data }: { data: ReviewTimelinePoint[] }) {
  const points = data.map((d) => ({ ...d, remembered: d.reviews - d.again }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={points} margin={{ left: -24, right: 8, top: 8, bottom: 0 }}>
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
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ReviewTooltip />} />
        <Bar dataKey="remembered" stackId="r" fill="var(--viz-series)" isAnimationActive={false} maxBarSize={24} />
        <Bar dataKey="again" stackId="r" fill="var(--viz-sev-minor)" isAnimationActive={false} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReviewTooltip({ active, payload }: { active?: boolean; payload?: { payload: ReviewTimelinePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{formatDate(p.bucket)}</div>
      {p.reviews > 0 ? (
        <>
          <div>
            <span className="font-medium tabular-nums">{p.reviews}</span>{" "}
            <span className="text-muted-foreground">{p.reviews === 1 ? "review" : "reviews"}</span>
          </div>
          <div className="text-muted-foreground">{p.again} graded Again</div>
        </>
      ) : (
        <div className="text-muted-foreground">No reviews</div>
      )}
    </div>
  );
}

function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
