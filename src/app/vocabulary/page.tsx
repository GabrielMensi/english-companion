import { Layers } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { VocabularyList } from "@/components/vocabulary/vocabulary-list";
import { getVocabulary } from "@/lib/vocabulary";

export default async function VocabularyPage() {
  await connection();
  const words = getVocabulary();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Vocabulary</h1>
            <p className="text-muted-foreground">
              Words you didn’t know how to say, written between [brackets] in your messages.
            </p>
          </div>
          {words.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href="/flashcards?deck=vocabulary">
                <Layers /> Practice
              </Link>
            </Button>
          )}
        </div>
        <VocabularyList initialWords={words} />
      </div>
    </div>
  );
}
