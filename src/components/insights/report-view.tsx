import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { StatsDigest } from "@/lib/insights/digest-core";

/** The period's digest: what the study plan is based on, and what to take to class. */
export function ReportView({ digest }: { digest: StatsDigest }) {
  const { totals } = digest;
  const delta = totals.previousPer100Words === null ? null : totals.per100Words - totals.previousPer100Words;

  return (
    <div className="space-y-5 text-sm">
      <p>
        {totals.messages} messages · {totals.words.toLocaleString("en-US")} words · {totals.errors} mistakes ·{" "}
        <span className="font-medium">{totals.per100Words} per 100 words</span>
        {delta !== null && Math.abs(delta) >= 0.01 && (
          <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground">
            {delta < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
            {Math.abs(Math.round(delta * 100) / 100)} {delta < 0 ? "fewer" : "more"} than the period before
          </span>
        )}
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Weakest areas">
          {digest.weakest.length === 0 ? (
            <Empty>No mistakes in this period.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {digest.weakest.map((a) => (
                <li key={a.category}>
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-muted-foreground">
                    · {a.count} ({a.per100Words}/100 words){a.types.length > 0 && ` · ${a.types.join(", ")}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Changes vs the period before">
          {digest.worsened.length === 0 && digest.improved.length === 0 ? (
            <Empty>No clear changes (or no data from the period before).</Empty>
          ) : (
            <ul className="space-y-1.5">
              {digest.worsened.map((a) => (
                <li key={a.category} className="flex items-center gap-1.5">
                  <ArrowUpRight className="size-3.5 text-red-600 dark:text-red-400" />
                  {a.label} <span className="text-muted-foreground">+{a.trend}/100 words</span>
                </li>
              ))}
              {digest.improved.map((a) => (
                <li key={a.category} className="flex items-center gap-1.5">
                  <ArrowDownRight className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  {a.label} <span className="text-muted-foreground">{a.trend}/100 words</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Verb tenses">
          {digest.tenses.length === 0 ? (
            <Empty>
              No weak or avoided tenses
              {digest.unclassifiedTenses > 0 && ` yet (${digest.unclassifiedTenses} verb mistakes still to classify)`}.
            </Empty>
          ) : (
            <ul className="space-y-1.5">
              {digest.tenses.map((t) => (
                <li key={t.tense}>
                  <span className="font-medium">{t.label}</span>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {t.status === "avoided"
                      ? "almost never used"
                      : `${t.status}${t.accuracy !== null ? `, ${t.accuracy}% correct` : ""}${
                          t.confusedWith ? `, often replaced with ${t.confusedWith}` : ""
                        }`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Words you looked up">
          {digest.vocabulary.length === 0 ? (
            <Empty>No [bracket] lookups in this period.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {digest.vocabulary.map((w) => (
                <li key={w.spanish} className="rounded-lg border px-2.5 py-1">
                  <span className="text-muted-foreground">{w.spanish}</span> →{" "}
                  <span className="font-medium">{w.english}</span>
                  {w.times > 1 && <span className="ml-1 text-xs text-muted-foreground">{w.times}×</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {digest.topMistakes.length > 0 && (
        <Section title="Most repeated mistakes">
          <ul className="divide-y">
            {digest.topMistakes.map((m) => (
              <li key={`${m.category}/${m.label}`} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                <div className="w-8 shrink-0 text-right font-semibold tabular-nums">{m.count}×</div>
                <div className="min-w-0 space-y-0.5">
                  <div>
                    <span className="font-medium">{m.label}</span>{" "}
                    <span className="text-muted-foreground">· {m.category}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-red-600/90 line-through dark:text-red-400/90">{m.original}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="text-emerald-700 dark:text-emerald-400">{m.correction}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
