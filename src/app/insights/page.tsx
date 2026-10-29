import Link from "next/link";
import { connection } from "next/server";
import { LevelCard } from "@/components/insights/level-card";
import { ReportView } from "@/components/insights/report-view";
import { StudyPlan } from "@/components/insights/study-plan";
import { Page, PageHeader, Section } from "@/components/layout/page";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { getLevelData, getReportDigest, getStoredPlan, REPORT_RANGES, type ReportRange } from "@/lib/insights/insights";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/lib/auth/session";

const RANGE_LABELS: Record<ReportRange, string> = { "7": "This week", "30": "30 days" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  await connection();
  const { userId } = await requirePageUser("/insights");
  const { range: rawRange } = await searchParams;
  const range: ReportRange = REPORT_RANGES.includes(rawRange as ReportRange) ? (rawRange as ReportRange) : "7";
  const digest = getReportDigest(userId, range);
  const level = getLevelData(userId);
  const hasModel = hasConfiguredProvider();

  return (
    <Page area="review" width="xl">
      <PageHeader
        title="Insights"
        description="Your report, a study plan for the week and an estimate of your level."
      />

      {!hasModel && (
        <NoProviderNotice detail="The report and the level estimate still work; the study plan and the level explanation need a key." />
      )}

      <Section
        title="Report"
        description="What went well and what didn’t, compared with the period before"
        action={
          <nav className="flex rounded-lg border p-0.5" aria-label="Period">
            {REPORT_RANGES.map((key) => (
              <Link
                key={key}
                href={`/insights?range=${key}`}
                aria-current={key === range ? "true" : undefined}
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
      </Section>

      {digest.totals.messages > 0 && (
        <Section title="Study plan" description="What to practice next, based on the report">
          <StudyPlan key={range} digest={digest} range={range} initial={getStoredPlan(userId)} hasModel={hasModel} />
        </Section>
      )}

      <Section
        title="Estimated level (CEFR)"
        description="A rough estimate from your mistakes and the vocabulary you use"
      >
        <LevelCard
          estimate={level.estimate}
          evolution={level.evolution}
          explanation={level.explanation}
          teacher={level.teacher}
          hasModel={hasModel}
        />
      </Section>
    </Page>
  );
}
