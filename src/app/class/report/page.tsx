import Link from "next/link";
import { connection } from "next/server";

import { ClassQuestionsPanel } from "@/components/class/class-questions";
import { ReportActions } from "@/components/class/report-actions";
import { ReportView } from "@/components/insights/report-view";
import { Page, PageHeader, Section } from "@/components/layout/page";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { requirePageUser } from "@/lib/auth/session";
import { classReportToMarkdown } from "@/lib/class-core";
import { getClassReport } from "@/lib/class-report";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : (value ?? null));
const inputDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default async function ClassReportPage({ searchParams }: PageProps<"/class/report">) {
  await connection();
  const { userId } = await requirePageUser("/class/report");
  const raw = await searchParams;
  const request = { sinceId: first(raw.since), from: first(raw.from), to: first(raw.to) };
  const report = getClassReport(userId, request);
  const { digest, period, teacher } = report;
  const hasModel = hasConfiguredProvider(userId);
  const query = new URLSearchParams(
    Object.entries(request).flatMap(([k, v]) => (v ? [[k === "sinceId" ? "since" : k, v]] : [])),
  ).toString();
  const markdown = classReportToMarkdown(digest, {
    since: period.since,
    questions: report.questions,
    teacher: teacher && { heldAt: teacher.heldAt, level: teacher.level },
    appLevel: report.appLevel,
  });
  const label = period.since
    ? `Since the class on ${dateTime.format(period.since.heldAt)}`
    : `${date.format(period.from)} – ${date.format(period.to)}`;

  return (
    <Page area="review" width="xl">
      <PageHeader
        title="Report for class"
        description={`${label}. What you wrote in that time, without what the teacher already corrected.`}
        actions={<ReportActions markdown={markdown} query={query} />}
      />

      {!hasModel && <NoProviderNotice detail="The report works without a key; only the questions need one." />}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm print:hidden">
        {report.meetings.length > 0 && (
          <form method="get" className="flex items-end gap-2">
            <label className="space-y-1">
              <span className="block text-muted-foreground">Since a class</span>
              <select
                name="since"
                defaultValue={period.since?.id ?? ""}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs"
              >
                {report.meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {dateTime.format(m.heldAt)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm">
              Show
            </Button>
          </form>
        )}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-muted-foreground">From</span>
            <Input
              type="date"
              name="from"
              required
              className="w-40"
              defaultValue={request.from ?? inputDay(period.from)}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-muted-foreground">To (optional)</span>
            <Input type="date" name="to" className="w-40" defaultValue={request.to ?? ""} />
          </label>
          <Button type="submit" variant="outline" size="sm">
            Use these dates
          </Button>
        </form>
        <Button asChild variant="ghost" size="sm">
          <Link href="/class">Back to Class</Link>
        </Button>
      </div>

      {(teacher || report.appLevel) && (
        <Section title="Level">
          <ul className="space-y-1 text-sm">
            {report.appLevel && (
              <li>
                App’s estimate (from your writing): <span className="font-medium">{report.appLevel}</span>
              </li>
            )}
            {teacher && (
              <li>
                Teacher’s level on {date.format(teacher.heldAt)}: <span className="font-medium">{teacher.level}</span>
                {teacher.comparison && <span className="text-muted-foreground"> · {teacher.comparison.text}</span>}
              </li>
            )}
          </ul>
        </Section>
      )}

      <Section title="Report">
        {digest.totals.messages === 0 ? (
          <p className="text-sm text-muted-foreground">You didn’t write anything in this period.</p>
        ) : (
          <ReportView digest={digest} />
        )}
      </Section>

      <Section title="What to ask the teacher">
        <ClassQuestionsPanel
          questions={report.questions}
          period={request}
          hasModel={hasModel}
          canWrite={digest.totals.errors > 0 || digest.vocabulary.length > 0}
        />
      </Section>
    </Page>
  );
}
