"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { NeedsKeyHint } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { digestToMarkdown, type StatsDigest } from "@/lib/insights/digest-core";
import type { StoredPlan } from "@/lib/insights/insights";

/** The AI study plan for the period, generated on demand and kept until the next one. */
export function StudyPlan({
  digest,
  range,
  initial,
  hasModel,
}: {
  digest: StatsDigest;
  range: string;
  initial: StoredPlan | null;
  /** Whether an AI provider is set up; without one a plan can't be written (a saved one is still shown). */
  hasModel: boolean;
}) {
  const [stored, setStored] = useState(initial);
  const [loading, setLoading] = useState(false);
  // A plan written for another period is still shown, but not exported with this report.
  const samePeriod = stored?.digest.period.days === digest.period.days;

  async function generate() {
    setLoading(true);
    try {
      setStored(await api<StoredPlan>("/api/insights/plan", { body: { range } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't write the plan");
    } finally {
      setLoading(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <NeedsKeyHint active={!hasModel}>
        <Button variant={stored ? "outline" : "default"} size="sm" onClick={generate} disabled={loading || !hasModel}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {loading ? "Writing the plan…" : stored ? "Write a new plan" : "Write my study plan"}
        </Button>
      </NeedsKeyHint>
      <CopyButton
        text={digestToMarkdown(digest, samePeriod ? stored?.plan : null)}
        label={samePeriod ? "Copy report and plan (Markdown)" : "Copy report (Markdown)"}
      />
    </div>
  );

  if (!stored) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The AI reads the report above and suggests what to practice this week, with exercises and examples.
        </p>
        {actions}
      </div>
    );
  }

  const { plan } = stored;
  return (
    <div className="space-y-4 text-sm">
      <p>{plan.summary}</p>
      <ol className="space-y-3">
        {plan.focus.map((f, i) => (
          <li key={f.topic} className="space-y-1 rounded-lg border p-3">
            <div className="font-medium">
              {i + 1}. {f.topic}
            </div>
            <p className="text-muted-foreground">{f.why}</p>
            <p>
              <span className="font-medium">Practice:</span> {f.practice}
            </p>
            {f.example && (
              <p>
                <span className="font-medium">Example:</span> <span className="italic">{f.example}</span>
              </p>
            )}
          </li>
        ))}
      </ol>
      {plan.goal && (
        <p>
          <span className="font-medium">Goal:</span> {plan.goal}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Written {/* Server and browser can be in different time zones. */}
        <time suppressHydrationWarning>
          {new Date(stored.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </time>{" "}
        for the last {stored.digest.period.days} days, by {stored.modelId}.
        {!samePeriod && " It was written for another period: write a new one to match this report."}
      </p>
      {actions}
    </div>
  );
}
