"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NeedsKeyHint } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { StoredLevelExplanation } from "@/lib/insights/insights";

/** Optional AI layer: explains the rule-based estimate in plain words. */
export function LevelExplanationPanel({
  initial,
  hasModel,
}: {
  initial: StoredLevelExplanation | null;
  /** Whether an AI provider is set up; without one the estimate can't be explained (a saved explanation is still shown). */
  hasModel: boolean;
}) {
  const [stored, setStored] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function explain() {
    setLoading(true);
    try {
      setStored(await api<StoredLevelExplanation>("/api/insights/level", { method: "POST" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't explain the estimate");
    } finally {
      setLoading(false);
    }
  }

  if (!stored) {
    return (
      <NeedsKeyHint active={!hasModel}>
        <Button variant="outline" size="sm" onClick={explain} disabled={loading || !hasModel}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {loading ? "Explaining…" : "Explain with AI"}
        </Button>
      </NeedsKeyHint>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
      <p>{stored.explanation.explanation}</p>
      {stored.explanation.nextSteps.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {stored.explanation.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span>Written by {stored.modelId} · the AI explains the estimate, it doesn’t change it</span>
        <NeedsKeyHint active={!hasModel}>
          <Button variant="ghost" size="sm" onClick={explain} disabled={loading || !hasModel}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Regenerate
          </Button>
        </NeedsKeyHint>
      </div>
    </div>
  );
}
