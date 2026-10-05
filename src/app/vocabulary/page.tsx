import { Layers } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Page, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { VocabularyList } from "@/components/vocabulary/vocabulary-list";
import { getVocabulary } from "@/lib/vocabulary";

export default async function VocabularyPage() {
  await connection();
  const words = getVocabulary();

  return (
    <Page area="train">
      <PageHeader
        title="Vocabulary"
        description="Words you didn’t know how to say, written between [brackets] in your messages."
        actions={
          words.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href="/flashcards?deck=vocabulary">
                <Layers /> Study as flashcards
              </Link>
            </Button>
          )
        }
      />
      <VocabularyList initialWords={words} />
    </Page>
  );
}
