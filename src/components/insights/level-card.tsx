import type { LevelData, StoredLevelExplanation } from "@/lib/insights/insights";
import { CEFR_LEVELS, type LevelEstimate, type LevelWindow } from "@/lib/insights/level-core";
import { cn } from "@/lib/utils";

import { LevelExplanationPanel } from "./level-explanation";

const CONFIDENCE_LABELS = { low: "Low confidence", medium: "Medium confidence", high: "Good confidence" } as const;
const POSITION_LABELS = { low: "low", mid: "solid", high: "high" } as const;

/** The rule-based CEFR estimate, with every signal behind it and how it evolved. */
export function LevelCard({
  estimate,
  evolution,
  explanation,
  teacher,
  hasModel,
}: {
  estimate: LevelEstimate;
  evolution: LevelWindow[];
  explanation: StoredLevelExplanation | null;
  /** The level the teacher gave in the latest class that gave one. */
  teacher: LevelData["teacher"];
  hasModel: boolean;
}) {
  if (estimate.level === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Not enough writing yet: the estimate needs at least 300 words. Write about {estimate.wordsNeeded} more.
        </p>
        <TeacherLevel teacher={teacher} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-5xl font-semibold tabular-nums">{estimate.level}</div>
          <div className="text-sm text-muted-foreground">
            {POSITION_LABELS[estimate.position!]} {estimate.level}
          </div>
        </div>
        <div className="min-w-60 flex-1 space-y-2">
          <Scale score={estimate.score!} from={estimate.range!.from} to={estimate.range!.to} />
          <p className="text-sm text-muted-foreground">
            Likely between <span className="font-medium text-foreground">{estimate.range!.from}</span> and{" "}
            <span className="font-medium text-foreground">{estimate.range!.to}</span> ·{" "}
            {CONFIDENCE_LABELS[estimate.confidence!]}, from your last {estimate.words.toLocaleString("en-US")} words (
            {estimate.messages} messages)
          </p>
        </div>
      </div>

      <TeacherLevel teacher={teacher} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-normal">Signal</th>
              <th className="py-2 pr-4 font-normal">Measured</th>
              <th className="py-2 pr-4 font-normal">Level</th>
              <th className="py-2 text-right font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            {estimate.signals.map((s) => (
              <tr key={s.id} className="border-b align-top last:border-0">
                <td className="py-2 pr-4">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.basis}</div>
                </td>
                <td className="py-2 pr-4">{s.value}</td>
                <td className="py-2 pr-4 font-medium">{s.level}</td>
                <td className="py-2 text-right text-muted-foreground tabular-nums">
                  {s.weight > 0 ? `${Math.round(s.weight * 100)}%` : "Context"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimate.lookupsPer1000Words !== null && estimate.lookupsPer1000Words > 0 && (
        <p className="text-sm text-muted-foreground">
          You looked up {estimate.lookupsPer1000Words} words in Spanish per 1,000 words written (not part of the
          estimate).
        </p>
      )}

      {evolution.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Evolution</h3>
          <ul className="flex flex-wrap gap-2">
            {evolution.map((w) => (
              <li key={w.from} className="rounded-lg border px-3 py-1.5 text-sm">
                <span className="font-medium">{w.level}</span>{" "}
                <span className="text-muted-foreground">
                  · {formatDay(w.from)} · {w.words} words · {w.per100Words} mistakes/100
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        This is an estimate from fixed rules, not a test: it only sees what you write (or dictate) here, not your
        reading, listening or speaking. The rules were checked against essays graded A1–C2 by Cambridge examiners, where
        they matched the grade about 6 times in 10 and were within one level more than 9 times in 10; here the mistakes
        are found by the AI and chats and prompts aren&apos;t essays, so expect about one level of error either way. Use
        it to see the trend, not as a certificate.
      </p>

      <LevelExplanationPanel initial={explanation} hasModel={hasModel} />
    </div>
  );
}

function Scale({ score, from, to }: { score: number; from: string; to: string }) {
  const fromIndex = CEFR_LEVELS.indexOf(from as (typeof CEFR_LEVELS)[number]);
  const toIndex = CEFR_LEVELS.indexOf(to as (typeof CEFR_LEVELS)[number]);
  // Score 1..6 maps to the center of each of the 6 cells.
  const marker = ((score - 0.5) / 6) * 100;
  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-1">
        {CEFR_LEVELS.map((level, i) => (
          <div
            key={level}
            className={cn(
              "rounded py-1 text-center text-xs",
              i >= fromIndex && i <= toIndex ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {level}
          </div>
        ))}
      </div>
      <div
        className="absolute -top-1 h-8 w-0.5 rounded bg-primary"
        style={{ left: `${marker}%` }}
        aria-label={`Score ${score} of 6`}
      />
    </div>
  );
}

function formatDay(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** What the teacher said in class, next to the estimate; it never changes the estimate. */
function TeacherLevel({ teacher }: { teacher: LevelData["teacher"] }) {
  if (!teacher) return null;
  return (
    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      Your teacher’s level on {new Date(teacher.heldAt).toLocaleDateString("en-US", { dateStyle: "medium" })}:{" "}
      <span className="font-medium">{teacher.level}</span>
      {teacher.comparison && <span className="text-muted-foreground"> · {teacher.comparison.text}</span>}
    </p>
  );
}
