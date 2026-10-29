import Link from "next/link";
import { connection } from "next/server";

import { CategoryChart } from "@/components/dashboard/category-chart";
import { CategoryTable } from "@/components/dashboard/category-table";
import { ClassificationStatus } from "@/components/dashboard/classification-status";
import { FluencyPanel } from "@/components/dashboard/fluency-panel";
import { PronunciationPanel } from "@/components/dashboard/pronunciation-panel";
import { ReviewPanel } from "@/components/dashboard/review-panel";
import { TensePanel } from "@/components/dashboard/tense-panel";
import { TimelineChart } from "@/components/dashboard/timeline-chart";
import { TopMistakes } from "@/components/dashboard/top-mistakes";
import { Page, PageHeader, Section, SectionLink } from "@/components/layout/page";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { requirePageUser } from "@/lib/auth/session";
import { categoryTopic, selectCategoryTargets } from "@/lib/category-practice";
import { getClassificationStatus } from "@/lib/classification";
import { countDiscardedMistakes } from "@/lib/corrections";
import { dashboardDetail, dashboardHeadline } from "@/lib/dashboard-summary";
import { getAccuracyTimeline, getPronunciationProgress, hasReadings } from "@/lib/read-aloud";
import { getReviewDashboard } from "@/lib/review-stats";
import { getDashboardData, INPUT_FILTERS, type InputFilter, RANGES, type RangeKey } from "@/lib/stats";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<RangeKey, string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All" };
const INPUT_LABELS: Record<InputFilter, string> = { all: "All", typed: "Written", spoken: "Spoken" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const { userId } = await requirePageUser("/dashboard");
  const hasModel = hasConfiguredProvider(userId);
  const { range: rawRange, input: rawInput } = await searchParams;
  const range: RangeKey = typeof rawRange === "string" && rawRange in RANGES ? (rawRange as RangeKey) : "30";
  const input: InputFilter = INPUT_FILTERS.includes(rawInput as InputFilter) ? (rawInput as InputFilter) : "all";
  const { stats, tenses, vocabulary, fluency, countTypos, hasSpoken } = getDashboardData(userId, range, input);
  const reviews = getReviewDashboard(userId, range);
  const discardedCount = countDiscardedMistakes(userId);
  // Read-aloud practice isn't messages, so the written/spoken filter doesn't change it.
  const pronunciation = hasReadings(userId)
    ? {
        progress: getPronunciationProgress(userId, RANGES[range]),
        timeline: getAccuracyTimeline(userId, RANGES[range]),
      }
    : null;
  // The weakest categories in this period that make good exercises; none when there isn't enough data.
  const practiceTargets = selectCategoryTargets(stats).filter((t) => t.status === "weak");
  const href = (next: { range?: RangeKey; input?: InputFilter }) => {
    const params = new URLSearchParams({ range: next.range ?? range });
    const nextInput = next.input ?? input;
    if (nextInput !== "all") params.set("input", nextInput);
    return `/dashboard?${params}`;
  };

  return (
    <Page area="review" width="2xl">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Where you’re strong, where you’re weak and what to practice next.
            {!countTypos && " Typos don’t count as mistakes."}
          </>
        }
        actions={
          <>
            {hasSpoken && (
              <nav className="flex rounded-lg border p-0.5" aria-label="Written or spoken">
                {INPUT_FILTERS.map((key) => (
                  <Link
                    key={key}
                    href={href({ input: key })}
                    aria-current={key === input ? "true" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
                      key === input && "bg-muted font-medium text-foreground",
                    )}
                  >
                    {INPUT_LABELS[key]}
                  </Link>
                ))}
              </nav>
            )}
            <nav className="flex rounded-lg border p-0.5" aria-label="Period">
              {(Object.keys(RANGES) as RangeKey[]).map((key) => (
                <Link
                  key={key}
                  href={href({ range: key })}
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
          </>
        }
      />

      {!hasModel && (
        <NoProviderNotice detail="Your stats still work; the exercises behind “Practice this” need a key." />
      )}

      {hasSpoken && input !== "typed" && (
        <p className="text-sm text-muted-foreground">
          In spoken messages, articles, prepositions, pronouns, plurals, questions, spelling and punctuation aren’t
          counted: speech-to-text fills them in or decides them, so they don’t show what you actually said.
        </p>
      )}

      <ClassificationStatus initial={getClassificationStatus(userId)} />

      {stats.totals.messages === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No messages in this period yet.</p>
          <NewChatButton label="Write something" />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-section font-semibold tracking-tight">
              {dashboardHeadline(stats.totals, RANGES[range])}
            </p>
            <p className="text-muted-foreground">{dashboardDetail(stats.totals, countTypos)}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Areas to work on" description="Mistakes by category and severity">
              <CategoryChart categories={stats.categories.filter((c) => c.count > 0)} />
              {practiceTargets.length > 0 && (
                <div data-area="train" className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Practice this</p>
                  <div className="flex flex-wrap gap-2">
                    {practiceTargets.map((t) => (
                      <StartPracticeButton
                        key={`${t.category}/${t.subtype}`}
                        variant="outline"
                        request={{ kind: "category", category: t.category, subtype: t.subtype }}
                        hasModel={hasModel}
                      >
                        {categoryTopic(t)}
                      </StartPracticeButton>
                    ))}
                  </div>
                </div>
              )}
            </Section>
            <Section title="Progress" description="Mistakes per 100 words">
              <TimelineChart data={stats.timeline} />
            </Section>
          </div>

          <Section
            title="Verb tenses"
            description="How often you needed each tense and how often you got it right"
            action={<SectionLink href="/practice">Practice tenses</SectionLink>}
          >
            <TensePanel stats={tenses} />
          </Section>

          <div className="space-y-6 pt-4">
            <h2 className="text-section font-semibold tracking-tight text-muted-foreground">In detail</h2>
            <Section
              title="Vocabulary"
              description="Words you looked up with [brackets] in this period"
              action={<SectionLink href="/vocabulary">See all words</SectionLink>}
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
            </Section>

            <Section title="By category" description="Trend compared with the previous period of the same length">
              <CategoryTable categories={stats.categories} />
            </Section>

            <Section
              title="Most frequent mistakes"
              description="With the most recent example"
              action={
                discardedCount > 0 && (
                  <SectionLink href="/dashboard/discarded">Discarded ({discardedCount})</SectionLink>
                )
              }
            >
              <TopMistakes mistakes={stats.topMistakes} />
            </Section>

            {hasSpoken && input !== "typed" && (
              <Section title="Fluency" description="How you speak when you dictate: pace, long pauses and filler words">
                <FluencyPanel stats={fluency} />
              </Section>
            )}
          </div>
        </>
      )}

      {pronunciation && (
        <Section
          title="Pronunciation"
          description="Words speech-to-text heard differently when you read aloud, compared with the previous period"
          action={<SectionLink href="/read-aloud">Read aloud</SectionLink>}
        >
          <PronunciationPanel progress={pronunciation.progress} timeline={pronunciation.timeline} />
        </Section>
      )}

      {(reviews.totalCards > 0 || reviews.stats.since !== null) && (
        <Section
          title="Flashcards"
          description="Cards due, and how your reviews went in this period"
          action={<SectionLink href="/flashcards">Study cards</SectionLink>}
        >
          <ReviewPanel data={reviews} />
        </Section>
      )}
    </Page>
  );
}
