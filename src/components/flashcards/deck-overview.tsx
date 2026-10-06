import { BookOpen, Dumbbell, PencilLine } from "lucide-react";
import Link from "next/link";
import { Section } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import type { DeckCounts, MistakeFilter } from "@/lib/flashcards-core";
import type { FilterOption, FlashcardsOverview } from "@/lib/flashcards";
import { formatDelay } from "@/lib/srs";
import { cn } from "@/lib/utils";

function studyHref(deck: "vocabulary" | "mistakes" | "exercises", filter: MistakeFilter = {}): string {
  const params = new URLSearchParams({ deck });
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
  return `/flashcards?${params}`;
}

export function DeckOverview({ overview }: { overview: FlashcardsOverview }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Deck
          title="Vocabulary"
          description="Words you wrote between [brackets]: say them in English."
          icon={BookOpen}
          counts={overview.vocabulary}
          now={overview.now}
          newLimit={overview.newLimit}
          href={studyHref("vocabulary")}
          empty="No words yet. Write a word in Spanish between [brackets] in a chat."
        />
        <Deck
          title="Your mistakes"
          description="Real corrections: fix what you wrote."
          icon={PencilLine}
          counts={overview.mistakes}
          now={overview.now}
          newLimit={overview.newLimit}
          href={studyHref("mistakes")}
          empty="No mistakes to review yet."
        />
        <Deck
          title="Missed exercises"
          description="Practice items you got wrong: answer them again."
          icon={Dumbbell}
          counts={overview.exercises}
          now={overview.now}
          newLimit={overview.newLimit}
          href={studyHref("exercises")}
          empty="Nothing missed yet. Items you get wrong in Practice show up here."
        />
      </div>

      {overview.tenses.length > 0 && (
        <Section
          title="Study one tense"
          description="Your mistakes with verbs, by the tense the sentence needed. The numbers are cards to study / all cards."
        >
          <Chips options={overview.tenses} />
        </Section>
      )}

      {overview.categories.length > 0 && (
        <Section
          title="Study one type of mistake"
          description="Types appear once a mistake has been classified."
        >
          <ul className="divide-y">
            {overview.categories.map((c) => (
              <li key={c.label} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <Chip option={c} strong />
                {c.subtypes.length > 1 && <Chips options={c.subtypes} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Deck({
  title,
  description,
  icon: Icon,
  counts,
  now,
  newLimit,
  href,
  empty,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  counts: DeckCounts;
  now: number;
  newLimit: number;
  href: string;
  empty: string;
}) {
  const toStudy = counts.due + Math.min(counts.new, newLimit);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {counts.total === 0 ? (
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      ) : (
        <>
          <div className="flex gap-6">
            <Count label="Due" value={counts.due} />
            <Count label="New" value={counts.new} />
            <Count label="Learned" value={counts.learned} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {counts.total} {counts.total === 1 ? "card" : "cards"}
              {toStudy === 0 && counts.nextDueAt !== null && ` · next in ${formatDelay(counts.nextDueAt - now)}`}
            </span>
            {toStudy > 0 ? (
              <Button asChild size="sm">
                <Link href={href}>Study</Link>
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">All done for now</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className={cn("text-2xl font-semibold tabular-nums", value === 0 && "text-muted-foreground")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Chips({ options }: { options: FilterOption[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.label} option={o} />
      ))}
    </div>
  );
}

function Chip({ option, strong }: { option: FilterOption; strong?: boolean }) {
  const content = (
    <>
      <span className={cn(strong && "font-medium")}>{option.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {option.toStudy > 0 ? `${option.toStudy} / ${option.total}` : option.total}
      </span>
    </>
  );
  const className = "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm";
  if (option.toStudy === 0) {
    return (
      <span className={cn(className, "text-muted-foreground")} title="Nothing to review right now">
        {content}
      </span>
    );
  }
  return (
    <Link href={studyHref("mistakes", option.filter)} className={cn(className, "bg-background hover:bg-muted")}>
      {content}
    </Link>
  );
}
