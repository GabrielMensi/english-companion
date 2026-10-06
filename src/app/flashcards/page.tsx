import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { DeckOverview } from "@/components/flashcards/deck-overview";
import { ReviewSession } from "@/components/flashcards/review-session";
import { SuspendedCards } from "@/components/flashcards/suspended-cards";
import { Page, PageHeader } from "@/components/layout/page";
import type { CardKind, MistakeFilter } from "@/lib/flashcards-core";
import { resolveTranscriptionModel } from "@/lib/ai/providers";
import { getFlashcardsOverview, getStudyQueue } from "@/lib/flashcards";
import { getSuspendedCards } from "@/lib/flashcards-upkeep";
import { getSettings } from "@/lib/settings";
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

const DECKS: Record<string, CardKind> = {
  vocabulary: "vocabulary",
  mistakes: "mistake",
  exercises: "exercise",
  pronunciation: "pronunciation",
};

const DECK_SUBTITLES: Record<CardKind, string> = {
  vocabulary: "Spanish → English",
  mistake: "Fix your own mistakes",
  exercise: "Exercise items you got wrong in Practice",
  pronunciation: "Sentences you read aloud with words heard differently: read them again",
};

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
    const title =
      kind === "vocabulary"
        ? "Vocabulary"
        : kind === "exercise"
          ? "Missed exercises"
          : kind === "pronunciation"
            ? "Hard to say"
            : filterTitle(filter);
    return (
      <Page area="train" width="md">
        <PageHeader
          title={title}
          description={DECK_SUBTITLES[kind]}
          leading={
            <Link
              href="/flashcards"
              aria-label="Back to flashcards"
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
          }
        />
        <ReviewSession
          key={JSON.stringify(params)}
          kind={kind}
          initialQueue={queue}
          canRecord={resolveTranscriptionModel() !== null}
          language={getSettings().explanationLanguage}
        />
      </Page>
    );
  }

  const overview = getFlashcardsOverview();
  return (
    <Page area="train">
      <PageHeader
        title="Flashcards"
        description="Review the words you looked up, the mistakes you made, the exercises you missed and the sentences that were hard to say, spaced out so they stick."
      />
      <DeckOverview overview={overview} />
      <SuspendedCards cards={getSuspendedCards()} />
    </Page>
  );
}
