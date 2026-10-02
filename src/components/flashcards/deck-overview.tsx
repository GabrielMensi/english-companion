import { BookOpen, PencilLine } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DeckCounts, MistakeFilter } from "@/lib/flashcards-core";
import type { FilterOption, FlashcardsOverview } from "@/lib/flashcards";
import { formatDelay } from "@/lib/srs";
import { cn } from "@/lib/utils";

function studyHref(deck: "vocabulary" | "mistakes", filter: MistakeFilter = {}): string {
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
          href={studyHref("vocabulary")}
          empty="No words yet. Write a word in Spanish between [brackets] in a chat."
        />
        <Deck
          title="Your mistakes"
          description="Real corrections: fix what you wrote."
          icon={PencilLine}
          counts={overview.mistakes}
          now={overview.now}
          href={studyHref("mistakes")}
          empty="No mistakes to review yet."
        />
      </div>

      {overview.tenses.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-medium">Practice one tense</h2>
            <p className="text-sm text-muted-foreground">Mistakes with verbs, by the tense the sentence needed.</p>
          </div>
          <Chips options={overview.tenses} />
        </section>
      )}

      {overview.categories.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-medium">Practice one type of mistake</h2>
            <p className="text-sm text-muted-foreground">
              Types appear once a mistake has been classified.
            </p>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {overview.categories.map((c) => (
              <li key={c.label} className="space-y-2 p-3">
                <Chip option={c} strong />
                {c.subtypes.length > 1 && <Chips options={c.subtypes} />}
              </li>
            ))}
          </ul>
        </section>
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
  href,
  empty,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  counts: DeckCounts;
  now: number;
  href: string;
  empty: string;
}) {
  const toStudy = counts.due + counts.new;
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
            <Count label="Due" value={counts.due} className="text-amber-700 dark:text-amber-400" />
            <Count label="New" value={counts.new} className="text-sky-700 dark:text-sky-400" />
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

function Count({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className={cn("text-2xl font-semibold tabular-nums", value > 0 && className)}>{value}</div>
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
