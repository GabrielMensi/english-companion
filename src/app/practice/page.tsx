import Link from "next/link";
import { connection } from "next/server";
import { CustomCategoryPractice, CustomPractice } from "@/components/practice/custom-practice";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { Page, PageHeader, Section } from "@/components/layout/page";
import { CATEGORY_STATUS, EXERCISE_LABELS, STATUS } from "@/components/practice/labels";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { StatusBadge } from "@/components/status-badge";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { categoryTopic, NOT_PRACTICED } from "@/lib/category-practice";
import { getPracticeSuggestions } from "@/lib/practice-start";
import { ERROR_CATEGORIES, TENSE_LABELS } from "@/lib/taxonomy";
import { requirePageUser } from "@/lib/auth/session";

export default async function PracticePage() {
  await connection();
  const { userId } = await requirePageUser("/practice");
  const { tenses: targets, categories } = getPracticeSuggestions(userId);
  const suggestedCategories = categories.every((c) => c.status === "suggested");
  const suggested = targets.every((t) => t.status === "suggested");
  const hasModel = hasConfiguredProvider();

  return (
    <Page area="train">
      <PageHeader
        title="Practice"
        description={
          <>
            Verb tenses and types of mistakes to work on, picked from your{" "}
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-foreground">
              stats
            </Link>{" "}
            of the last 90 days. Your answers are corrected and count in the stats like any other message, and the items
            you miss come back as{" "}
            <Link href="/flashcards" className="underline underline-offset-2 hover:text-foreground">
              flashcards
            </Link>
            .
          </>
        }
      />

      {!hasModel && <NoProviderNotice detail="Exercises are written by the AI, so they need a key." />}

      <Section
        title={suggested ? "Suggested for you" : "Your weak spots"}
        description={
          suggested
            ? "Nothing stands out in your tenses yet (they need a few uses each, and verb mistakes need to be classified). These are common for Spanish speakers."
            : undefined
        }
      >
        <ul className="divide-y">
          {targets.map((t) => (
            <li key={`${t.tense}/${t.contrastWith}`} className="space-y-2.5 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">
                  {TENSE_LABELS[t.tense]}
                  {t.contrastWith && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      vs {TENSE_LABELS[t.contrastWith].toLowerCase()}
                    </span>
                  )}
                </h3>
                <StatusBadge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">{t.reason}</p>
              <div className="flex flex-wrap gap-2">
                <StartPracticeButton
                  request={{ kind: t.kind, tense: t.tense, contrastWith: t.contrastWith }}
                  hasModel={hasModel}
                >
                  {EXERCISE_LABELS[t.kind]}
                </StartPracticeButton>
                <StartPracticeButton
                  variant="outline"
                  request={{ kind: "conversation", tense: t.tense, contrastWith: null }}
                  hasModel={hasModel}
                >
                  Talk using it
                </StartPracticeButton>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={suggestedCategories ? "Other common mistakes" : "Your weakest areas"}
        description={
          <>
            {suggestedCategories
              ? "Not enough mistakes yet to pick from your stats. These are common for Spanish speakers."
              : "The types of mistakes you make most often per 100 words (verb tenses are above)."}{" "}
            Short exercises: fill in the gap, choose the right option and fix the mistake.
          </>
        }
      >
        <ul className="divide-y">
          {categories.map((c) => (
            <li key={`${c.category}/${c.subtype}`} className="space-y-2.5 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{categoryTopic(c)}</h3>
                <StatusBadge tone={CATEGORY_STATUS[c.status].tone}>{CATEGORY_STATUS[c.status].label}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">{c.reason}</p>
              <StartPracticeButton
                request={{ kind: "category", category: c.category, subtype: c.subtype }}
                hasModel={hasModel}
              >
                Exercises
              </StartPracticeButton>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Practice any tense"
        description="Contrast exercises mix two tenses; form drills practice building one; “use it” and conversation make you use a tense you rarely write."
      >
        <CustomPractice hasModel={hasModel} />
      </Section>

      <Section
        title="Practice any type of mistake"
        description="Exercises for any category, using your own mistakes in it as material."
      >
        <CustomCategoryPractice
          categories={ERROR_CATEGORIES.filter((c) => !NOT_PRACTICED.includes(c))}
          hasModel={hasModel}
        />
      </Section>
    </Page>
  );
}
