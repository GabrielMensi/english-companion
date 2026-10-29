import { withUser } from "@/lib/auth/with-user";
import { classReportToMarkdown } from "@/lib/class-core";
import { getClassReport } from "@/lib/class-report";

/** The report to take to class as Markdown (`?since=<class id>` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`). */
export const GET = withUser(async (request: Request, _ctx, { userId }) => {
  const params = new URL(request.url).searchParams;
  const report = getClassReport(userId, {
    sinceId: params.get("since"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const markdown = classReportToMarkdown(report.digest, {
    since: report.period.since,
    questions: report.questions,
    teacher: report.teacher && { heldAt: report.teacher.heldAt, level: report.teacher.level },
    appLevel: report.appLevel,
  });
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="english-report.md"',
    },
  });
});
