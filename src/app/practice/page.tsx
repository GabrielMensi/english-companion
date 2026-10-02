import Link from "next/link";
import { connection } from "next/server";
import { CustomPractice } from "@/components/practice/custom-practice";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { Badge } from "@/components/ui/badge";
import { getPracticeTargets } from "@/lib/practice-start";
import { TENSE_LABELS } from "@/lib/taxonomy";
import type { PracticeTarget } from "@/lib/tense-practice";
import { cn } from "@/lib/utils";

const STATUS: Record<PracticeTarget["status"], { label: string; className: string }> = {
  weak: { label: "Needs work", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  shaky: { label: "Getting there", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  avoided: { label: "Rarely used", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  not_enough_data: { label: "Few uses, some mistakes", className: "bg-muted text-muted-foreground" },
  strong: { label: "Strong", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  suggested: { label: "Suggested", className: "bg-muted text-muted-foreground" },
};

const EXERCISE_LABELS: Record<PracticeTarget["kind"], string> = {
  contrast: "Contrast exercise",
  form: "Form drill",
  use: "Use it in sentences",
};

export default async function PracticePage() {
  await connection();
  const targets = getPracticeTargets();
  const suggested = targets.every((t) => t.status === "suggested");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Practice</h1>
          <p className="text-muted-foreground">
            Verb tenses to work on, picked from your{" "}
            <Link href="/dashboard" className="underline underline-offset-2 hover:text-foreground">
              tense stats
            </Link>{" "}
            of the last 90 days. Your answers are corrected and count in the stats like any other message.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-medium">{suggested ? "Suggested for you" : "Your weak spots"}</h2>
          {suggested && (
            <p className="text-sm text-muted-foreground">
              Nothing stands out in your tenses yet (they need a few uses each, and verb mistakes need to be classified).
              These are common for Spanish speakers.
            </p>
          )}
          <ul className="space-y-3">
            {targets.map((t) => (
              <li key={`${t.tense}/${t.contrastWith}`} className="space-y-3 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">
                    {TENSE_LABELS[t.tense]}
                    {t.contrastWith && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        vs {TENSE_LABELS[t.contrastWith].toLowerCase()}
                      </span>
                    )}
                  </h3>
                  <Badge variant="secondary" className={cn(STATUS[t.status].className)}>
                    {STATUS[t.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <StartPracticeButton request={{ kind: t.kind, tense: t.tense, contrastWith: t.contrastWith }}>
                    {EXERCISE_LABELS[t.kind]}
                  </StartPracticeButton>
                  <StartPracticeButton
                    variant="outline"
                    request={{ kind: "conversation", tense: t.tense, contrastWith: null }}
                  >
                    Talk using it
                  </StartPracticeButton>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div>
            <h2 className="font-medium">Practice any tense</h2>
            <p className="text-sm text-muted-foreground">
              Contrast exercises mix two tenses; form drills practice building one; “use it” and conversation make you
              use a tense you rarely write.
            </p>
          </div>
          <CustomPractice />
        </section>
      </div>
    </div>
  );
}
