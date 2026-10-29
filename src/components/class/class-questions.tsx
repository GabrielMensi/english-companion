"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NeedsKeyHint } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ClassQuestions } from "@/lib/class-core";
import { voided } from "@/lib/voided";

/** "What to ask the teacher": written by the AI on demand from the period's stats, and kept. */
export function ClassQuestionsPanel({
  questions,
  period,
  hasModel,
  canWrite,
}: {
  questions: ClassQuestions | null;
  /** The period the report shows, to write the questions for the same one. */
  period: { sinceId: string | null; from: string | null; to: string | null };
  hasModel: boolean;
  /** Whether there is something in the period to ask about. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function write() {
    setLoading(true);
    try {
      await api("/api/class/report/questions", { body: period });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't write the questions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {questions ? (
        <ul className="space-y-2">
          {questions.questions.map((q) => (
            <li key={q.ask}>
              <p className="font-medium">{q.ask}</p>
              <p className="text-muted-foreground">{q.why}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground print:hidden">
          The AI reads the report and suggests what to ask the teacher.
        </p>
      )}
      <div className="print:hidden">
        <NeedsKeyHint active={!hasModel}>
          <Button
            variant={questions ? "outline" : "default"}
            size="sm"
            onClick={voided(write)}
            disabled={loading || !hasModel || !canWrite}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {questions ? "Write new questions" : "What should I ask?"}
          </Button>
        </NeedsKeyHint>
      </div>
    </div>
  );
}
