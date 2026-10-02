import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { DeckOverview } from "@/components/flashcards/deck-overview";
import { ReviewSession } from "@/components/flashcards/review-session";
import { SuspendedCards } from "@/components/flashcards/suspended-cards";
import type { CardKind, MistakeFilter } from "@/lib/flashcards-core";
import { getFlashcardsOverview, getStudyQueue } from "@/lib/flashcards";
import { getSuspendedCards } from "@/lib/flashcards-upkeep";
import {
  categoryLabel,
  ERROR_CATEGORIES,
  type ErrorCategory,
  isValidSubtype,
  subtypeLabel,
  type Tense,
  TENSE_LABELS,
  TENSES,
} from "@/lib/taxonomy";

const DECKS: Record<string, CardKind> = { vocabulary: "vocabulary", mistakes: "mistake" };

function parseFilter(params: Record<string, string | string[] | undefined>): MistakeFilter {
  const filter: MistakeFilter = {};
  if (TENSES.includes(params.tense as Tense)) filter.tense = params.tense as Tense;
  if (ERROR_CATEGORIES.includes(params.category as ErrorCategory)) {
    filter.category = params.category as ErrorCategory;
    if (typeof params.subtype === "string" && isValidSubtype(filter.category, params.subtype)) {
      filter.subtype = params.subtype;
    }
  }
  return filter;
}

function filterTitle(filter: MistakeFilter): string {
  if (filter.tense) return TENSE_LABELS[filter.tense];
  if (filter.category) {
    const type = subtypeLabel(filter.category, filter.subtype ?? null);
    return type ? `${categoryLabel(filter.category)}: ${type}` : categoryLabel(filter.category);
  }
  return "All mistakes";
}

export default async function FlashcardsPage({ searchParams }: PageProps<"/flashcards">) {
  await connection();
  const params = await searchParams;
  const kind = typeof params.deck === "string" ? DECKS[params.deck] : undefined;

  if (kind) {
    const filter = kind === "mistake" ? parseFilter(params) : {};
    const queue = getStudyQueue(kind, filter);
    const title = kind === "vocabulary" ? "Vocabulary" : filterTitle(filter);
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <Link
              href="/flashcards"
              aria-label="Back to flashcards"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">
                {kind === "vocabulary" ? "Spanish → English" : "Fix your own mistakes"}
              </p>
            </div>
          </div>
          <ReviewSession key={JSON.stringify(params)} kind={kind} initialQueue={queue} />
        </div>
      </div>
    );
  }

  const overview = getFlashcardsOverview();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Flashcards</h1>
          <p className="text-muted-foreground">
            Review the words you looked up and the mistakes you made, spaced out so they stick.
          </p>
        </div>
        <DeckOverview overview={overview} />
        <SuspendedCards cards={getSuspendedCards()} />
      </div>
    </div>
  );
}
