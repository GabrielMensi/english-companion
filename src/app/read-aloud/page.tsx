import Link from "next/link";
import { connection } from "next/server";
import { Page, PageHeader } from "@/components/layout/page";
import { ReadAloudPractice } from "@/components/read-aloud/read-aloud-practice";
import { resolveTranscriptionModel } from "@/lib/ai/providers";
import { getReadAloudData } from "@/lib/read-aloud";
import { parseFocus } from "@/lib/read-aloud-core";
import { getSettings } from "@/lib/settings";

export default async function ReadAloudPage({ searchParams }: PageProps<"/read-aloud">) {
  await connection();
  const { focus } = await searchParams;
  const { sounds, corrections, vocabulary, summary } = getReadAloudData();

  return (
    <Page area="train">
      <PageHeader
        title="Read aloud"
        description={
          <>
            Read a sentence and see which words speech-to-text heard differently. You know what you meant to say, so a
            word heard as another one points to the sound that changed. Those sentences come back as{" "}
            <Link href="/flashcards?deck=pronunciation" className="underline underline-offset-2 hover:text-foreground">
              flashcards
            </Link>
            .
          </>
        }
      />
      <ReadAloudPractice
        items={{ sounds, correction: corrections, vocabulary }}
        initialSummary={summary}
        initialFocus={parseFocus(focus)}
        canRecord={resolveTranscriptionModel() !== null}
        language={getSettings().explanationLanguage}
      />
    </Page>
  );
}
