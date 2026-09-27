import { connection } from "next/server";
import { VocabularyList } from "@/components/vocabulary/vocabulary-list";
import { getVocabulary } from "@/lib/vocabulary";

export default async function VocabularyPage() {
  await connection();
  const words = getVocabulary();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Vocabulary</h1>
          <p className="text-muted-foreground">
            Words you didn’t know how to say, written between [brackets] in your messages.
          </p>
        </div>
        <VocabularyList initialWords={words} />
      </div>
    </div>
  );
}
