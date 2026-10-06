import { connection } from "next/server";
import { Page, PageHeader } from "@/components/layout/page";
import { ReadAloudPractice } from "@/components/read-aloud/read-aloud-practice";
import { resolveTranscriptionModel } from "@/lib/ai/providers";
import { getReadAloudData } from "@/lib/read-aloud";
import { getSettings } from "@/lib/settings";

export default async function ReadAloudPage() {
  await connection();
  const { sounds, corrections, vocabulary, summary } = getReadAloudData();

  return (
    <Page area="train">
      <PageHeader
        title="Read aloud"
        description="Read a sentence and see which words speech-to-text heard differently. You know what you meant to say, so a word heard as another one points to the sound that changed."
      />
      <ReadAloudPractice
        items={{ sounds, correction: corrections, vocabulary }}
        initialSummary={summary}
        canRecord={resolveTranscriptionModel() !== null}
        language={getSettings().explanationLanguage}
      />
    </Page>
  );
}
