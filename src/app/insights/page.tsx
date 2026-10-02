import Link from "next/link";
import { connection } from "next/server";
import { LevelCard } from "@/components/insights/level-card";
import { ReportView } from "@/components/insights/report-view";
import { StudyPlan } from "@/components/insights/study-plan";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { getLevelData, getReportDigest, getStoredPlan, REPORT_RANGES, type ReportRange } from "@/lib/insights/insights";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<ReportRange, string> = { "7": "This week", "30": "30 days" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  await connection();
  const { range: rawRange } = await searchParams;
  const range: ReportRange = REPORT_RANGES.includes(rawRange as ReportRange) ? (rawRange as ReportRange) : "7";
  const digest = getReportDigest(range);
  const level = getLevelData();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Insights</h1>
          <p className="text-muted-foreground">Your report, a study plan for the week and an estimate of your level.</p>
        </div>

        <Panel
          title="Report"
          subtitle="What went well and what didn’t, compared with the period before"
          action={
            <nav className="flex rounded-lg border p-0.5" aria-label="Period">
              {REPORT_RANGES.map((key) => (
                <Link
                  key={key}
                  href={`/insights?range=${key}`}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
                    key === range && "bg-muted font-medium text-foreground",
                  )}
                >
                  {RANGE_LABELS[key]}
                </Link>
              ))}
            </nav>
          }
        >
          {digest.totals.messages === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-muted-foreground">No messages in this period yet.</p>
              <NewChatButton label="Write something" />
            </div>
          ) : (
            <ReportView digest={digest} />
          )}
        </Panel>

        {digest.totals.messages > 0 && (
          <Panel title="Study plan" subtitle="What to practice next, based on the report">
            <StudyPlan key={range} digest={digest} range={range} initial={getStoredPlan()} />
          </Panel>
        )}

        <Panel title="Estimated level (CEFR)" subtitle="A rough estimate from your mistakes and the vocabulary you use">
          <LevelCard estimate={level.estimate} evolution={level.evolution} explanation={level.explanation} />
        </Panel>
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
      <div className="flex flex-wrap items-start justify-between gap-4">
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
