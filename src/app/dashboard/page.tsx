import Link from "next/link";
import { connection } from "next/server";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { CategoryTable } from "@/components/dashboard/category-table";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TimelineChart } from "@/components/dashboard/timeline-chart";
import { TopMistakes } from "@/components/dashboard/top-mistakes";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { getDashboardData, RANGES, type RangeKey } from "@/lib/stats";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<RangeKey, string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const { range: rawRange } = await searchParams;
  const range: RangeKey = typeof rawRange === "string" && rawRange in RANGES ? (rawRange as RangeKey) : "30";
  const { stats, vocabulary, countTypos } = getDashboardData(range);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground">
              Where you’re strong, where you’re weak and what to practice next.
              {!countTypos && " Typos don’t count as mistakes."}
            </p>
          </div>
          <nav className="flex rounded-lg border p-0.5" aria-label="Period">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <Link
                key={key}
                href={`/dashboard?range=${key}`}
                className={cn(
                  "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
                  key === range && "bg-muted font-medium text-foreground",
                )}
              >
                {RANGE_LABELS[key]}
              </Link>
            ))}
          </nav>
        </div>

        {stats.totals.messages === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">No messages in this period yet.</p>
            <NewChatButton label="Write something" />
          </div>
        ) : (
          <>
            <StatTiles totals={stats.totals} />

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Areas to work on" subtitle="Mistakes by category and severity">
                <CategoryChart categories={stats.categories.filter((c) => c.count > 0)} />
              </Panel>
              <Panel title="Progress" subtitle="Mistakes per 100 words">
                <TimelineChart data={stats.timeline} />
              </Panel>
            </div>

            <Panel
              title="Vocabulary"
              subtitle="Words you looked up with [brackets] in this period"
              action={
                <Link href="/vocabulary" className="text-sm text-muted-foreground hover:text-foreground">
                  See all →
                </Link>
              }
            >
              {vocabulary.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lookups in this period. When you don’t know a word, write it in Spanish between brackets:{" "}
                  <code className="rounded bg-muted px-1">I want to [aprovechar] this</code>
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {vocabulary.slice(0, 12).map((w) => (
                    <li key={w.key} className="rounded-lg border px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">{w.spanish}</span> →{" "}
                      <span className="font-medium">{w.english[0]}</span>
                      {w.timesLookedUp > 1 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{w.timesLookedUp}×</span>
                      )}
                    </li>
                  ))}
                  {vocabulary.length > 12 && (
                    <li className="px-1 py-1.5 text-sm text-muted-foreground">+{vocabulary.length - 12} more</li>
                  )}
                </ul>
              )}
            </Panel>

            <Panel
              title="By category"
              subtitle="Trend compared with the previous period of the same length"
            >
              <CategoryTable categories={stats.categories} />
            </Panel>

            <Panel title="Most frequent mistakes" subtitle="With the most recent example">
              <TopMistakes mistakes={stats.topMistakes} />
            </Panel>

          </>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
