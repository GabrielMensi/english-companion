import { AudioLines, Dumbbell, Layers, MessageSquareText, MessagesSquare, PencilLine } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Page, Section, SectionLink } from "@/components/layout/page";
import { CATEGORY_STATUS, EXERCISE_LABELS, STATUS } from "@/components/practice/labels";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { TalkAboutButton } from "@/components/sidebar/talk-about-button";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { categoryTopic } from "@/lib/category-practice";
import { listSessions } from "@/lib/chat";
import { countCardsToStudy } from "@/lib/flashcards";
import { getReportDigest } from "@/lib/insights/insights";
import { chatLabels } from "@/lib/practice";
import { getPronunciationSummary } from "@/lib/read-aloud";
import { getPracticeSuggestions } from "@/lib/practice-start";
import { PRONUNCIATION_LABELS, TENSE_LABELS } from "@/lib/taxonomy";
import type { PracticeTarget } from "@/lib/tense-practice";
import { greeting, todaySummary, weekSummary } from "@/lib/today-core";
import { requirePageUser } from "@/lib/auth/session";

export default async function Today() {
  await connection();
  const { userId } = await requirePageUser("/");
  const sessions = listSessions(userId);
  const hasModel = hasConfiguredProvider();
  if (sessions.length === 0) return <FirstRun hasModel={hasModel} />;

  const last = sessions[0];
  const lastLabel = chatLabels(userId).get(last.id);
  const cardsToStudy = countCardsToStudy(userId);
  const { tenses, categories } = getPracticeSuggestions(userId);
  const tense = tenses[0];
  const category = categories[0];
  const week = getReportDigest(userId, "7", { withPronunciation: false, withoutClass: true }).totals;
  const pronunciation = getPronunciationSummary(userId);
  // The sound with the most issues (categories come sorted that way). "Other" has no sentences to practice,
  // and without any issue there is no weakest sound to name, so the row stays hidden.
  const soundStats = pronunciation.categories.find((c) => c.category !== "other");

  return (
    <Page width="xl">
      <header className="space-y-1.5">
        <h1 className="text-display font-semibold tracking-tight">{greeting(new Date().getHours())}.</h1>
        <p className="text-section text-muted-foreground">
          {todaySummary({ cardsToStudy, focus: focusOf(tense), wroteThisWeek: week.messages > 0 })}
        </p>
      </header>

      {!hasModel && (
        <NoProviderNotice detail="Your stats and flashcards still work; corrections and exercises need a key." />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div data-area="write">
            <Section title="Keep writing">
              <Link
                href={`/chat/${last.id}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted"
              >
                {lastLabel?.practice ? (
                  <Dumbbell className="size-4 shrink-0 text-train" />
                ) : lastLabel?.topic ? (
                  <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                ) : last.mode === "conversation" ? (
                  <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <PencilLine className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{last.title}</span>
                <span className="text-sm font-medium text-primary">Continue</span>
              </Link>
              <div className="flex flex-wrap gap-2">
                <NewChatButton mode="correction" label="New correction chat" />
                <NewChatButton mode="conversation" label="New conversation" variant="outline" />
                <TalkAboutButton />
              </div>
            </Section>
          </div>

          <div data-area="review">
            <Section title="This week" action={<SectionLink href="/insights">See the report</SectionLink>}>
              {week.messages === 0 ? (
                <p className="text-muted-foreground">Nothing written in the last 7 days.</p>
              ) : (
                <p>{weekSummary(week)}</p>
              )}
            </Section>
          </div>
        </div>

        <div data-area="train">
          <Section title="Train" action={<SectionLink href="/practice">All practice</SectionLink>}>
            <ul className="divide-y">
              <TrainRow
                icon={<Layers className="size-4 text-train" />}
                title={
                  cardsToStudy > 0
                    ? `${cardsToStudy} ${cardsToStudy === 1 ? "card" : "cards"} to study`
                    : "No cards due"
                }
                detail="Words you looked up, your mistakes and the exercises you missed."
                action={
                  <Button asChild size="sm" variant={cardsToStudy > 0 ? "default" : "outline"}>
                    <Link href="/flashcards">{cardsToStudy > 0 ? "Study" : "See decks"}</Link>
                  </Button>
                }
              />
              {tense && (
                <TrainRow
                  icon={<Dumbbell className="size-4 text-train" />}
                  title={
                    <>
                      {TENSE_LABELS[tense.tense]}
                      {tense.contrastWith && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          vs {TENSE_LABELS[tense.contrastWith].toLowerCase()}
                        </span>
                      )}
                    </>
                  }
                  badge={<StatusBadge tone={STATUS[tense.status].tone}>{STATUS[tense.status].label}</StatusBadge>}
                  detail={tense.reason}
                  action={
                    <StartPracticeButton
                      variant="outline"
                      request={{ kind: tense.kind, tense: tense.tense, contrastWith: tense.contrastWith }}
                      hasModel={hasModel}
                    >
                      {EXERCISE_LABELS[tense.kind]}
                    </StartPracticeButton>
                  }
                />
              )}
              {category && (
                <TrainRow
                  icon={<Dumbbell className="size-4 text-train" />}
                  title={categoryTopic(category)}
                  badge={
                    <StatusBadge tone={CATEGORY_STATUS[category.status].tone}>
                      {CATEGORY_STATUS[category.status].label}
                    </StatusBadge>
                  }
                  detail={category.reason}
                  action={
                    <StartPracticeButton
                      variant="outline"
                      request={{ kind: "category", category: category.category, subtype: category.subtype }}
                      hasModel={hasModel}
                    >
                      Exercises
                    </StartPracticeButton>
                  }
                />
              )}
              {soundStats && (
                <TrainRow
                  icon={<AudioLines className="size-4 text-train" />}
                  title={`Your weakest sound: ${PRONUNCIATION_LABELS[soundStats.category]}`}
                  detail={soundDetail(soundStats)}
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/read-aloud?focus=${soundStats.category}`}>Read aloud</Link>
                    </Button>
                  }
                />
              )}
            </ul>
          </Section>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Don’t know how to say something? Write it in Spanish between brackets:{" "}
        <span className="font-serif text-base text-foreground">I want to [aprovechar] this moment</span>
      </p>
    </Page>
  );
}

/** The tense to name in the headline: one that needs work, or one you avoid. */
function focusOf(target: PracticeTarget | undefined): string | null {
  if (!target) return null;
  const name = TENSE_LABELS[target.tense].toLowerCase();
  if (target.status === "weak") return `${name} needs work`;
  if (target.status === "avoided") return `you rarely use ${name}`;
  return null;
}

/** "4 words heard differently, like “ship” heard as “sheep”." */
function soundDetail(stats: { count: number; examples: { expected: string; heard: string }[] }): string {
  const example = stats.examples[0];
  const words = `${stats.count} ${stats.count === 1 ? "word" : "words"} heard differently`;
  return example ? `${words}, like “${example.expected}” heard as “${example.heard}”.` : `${words}.`;
}

function TrainRow({
  icon,
  title,
  badge,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span>{title}</span>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

/** Before the first chat: what the app does and the two ways to start. */
function FirstRun({ hasModel }: { hasModel: boolean }) {
  return (
    <Page width="md">
      <header className="space-y-2">
        <h1 className="text-display font-semibold tracking-tight">Let’s practice English.</h1>
        <p className="text-muted-foreground">
          Write in English and get it back corrected, with every mistake highlighted and explained. Your mistakes are
          saved, so the dashboard can show you where you need practice.
        </p>
      </header>
      {!hasModel && <NoProviderNotice detail="Corrections are written by the AI, so they need a key." />}
      <div data-area="write" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Correction</h2>
          <p className="text-sm text-muted-foreground">
            Corrections only. Good for writing prompts or messages to use somewhere else.
          </p>
          <NewChatButton mode="correction" label="Start a correction chat" />
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Conversation</h2>
          <p className="text-sm text-muted-foreground">
            Corrects you and also replies, so you can practice chatting about anything.
          </p>
          <div className="flex flex-wrap gap-2">
            <NewChatButton mode="conversation" label="Start a conversation" variant="outline" />
            <TalkAboutButton />
          </div>
        </div>
      </div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>
          Don’t know how to say something? Write it in Spanish between brackets:{" "}
          <span className="font-serif text-base text-foreground">I want to [aprovechar] this moment</span>
        </li>
        <li>Typos are highlighted, but they don’t count as mistakes in your stats.</li>
      </ul>
    </Page>
  );
}
