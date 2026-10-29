import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { AccuracyChart } from "@/components/dashboard/accuracy-chart";
import { Trend } from "@/components/dashboard/category-table";
import type { AccuracyPoint, PronunciationProgress } from "@/lib/read-aloud-core";
import { PRONUNCIATION_LABELS } from "@/lib/taxonomy";

export function PronunciationPanel({
  progress,
  timeline,
}: {
  progress: PronunciationProgress;
  timeline: AccuracyPoint[];
}) {
  if (progress.attempts === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No readings in this period.{" "}
        <Link href="/read-aloud" className="font-medium text-primary underline-offset-4 hover:underline">
          Read a few sentences aloud
        </Link>{" "}
        to see which sounds speech-to-text hears differently.
      </p>
    );
  }

  const accuracy = Math.round((progress.accuracy ?? 0) * 100);
  const previous = progress.previousAccuracy === null ? null : Math.round(progress.previousAccuracy * 100);
  const delta = previous === null ? null : accuracy - previous;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tabular-nums">{accuracy}%</span>
        <span className="text-sm text-muted-foreground">
          of {progress.words.toLocaleString("en-US")} words heard as written, in {progress.attempts}{" "}
          {progress.attempts === 1 ? "reading" : "readings"}
        </span>
        {delta !== null && delta !== 0 && (
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta)} {Math.abs(delta) === 1 ? "point" : "points"} {delta > 0 ? "better" : "worse"} than the
            previous period
          </span>
        )}
      </div>

      <AccuracyChart data={timeline} />

      {progress.categories.length === 0 ? (
        <p className="text-sm">No sounds heard differently in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-4 font-normal">Sound</th>
                <th className="py-2 pr-4 text-right font-normal">Times</th>
                <th className="py-2 pr-4 text-right font-normal">Per 100 words read</th>
                <th className="py-2 pr-4 font-normal">Heard as</th>
                <th className="py-2 font-normal">Trend</th>
              </tr>
            </thead>
            <tbody>
              {progress.categories.map((c) => (
                <tr key={c.category} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {c.category === "other" ? (
                      PRONUNCIATION_LABELS[c.category]
                    ) : (
                      <Link href={`/read-aloud?focus=${c.category}`} className="underline-offset-4 hover:underline">
                        {PRONUNCIATION_LABELS[c.category]}
                      </Link>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.count}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.per100Words}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {c.examples.length === 0
                      ? "—"
                      : c.examples.map((e, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            <span className="font-serif">{e.expected}</span> as{" "}
                            <span className="font-serif text-mark-wrong">{e.heard}</span>
                            {e.count > 1 && <span className="tabular-nums"> ({e.count})</span>}
                          </span>
                        ))}
                  </td>
                  <td className="py-2">
                    <Trend value={c.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
