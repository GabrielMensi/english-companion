import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MIN_USES, type TenseStat, type TenseStats, type TenseStatus } from "@/lib/tense-stats";
import { type Tense, TENSE_LABELS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const FAMILIES: { title: string; tenses: Tense[] }[] = [
  {
    title: "Present",
    tenses: ["present_simple", "present_continuous", "present_perfect", "present_perfect_continuous"],
  },
  {
    title: "Past",
    tenses: ["past_simple", "past_continuous", "past_perfect", "past_perfect_continuous", "used_to_would"],
  },
  {
    title: "Future and conditional",
    tenses: ["future_will", "future_going_to", "future_continuous", "future_perfect", "conditional_would"],
  },
];

const STATUS: Record<TenseStatus, { label: string; className: string }> = {
  strong: { label: "Strong", className: "bg-mark-right/12 text-mark-right" },
  shaky: { label: "Getting there", className: "bg-sev-minor/18 text-sev-minor-text" },
  weak: { label: "Needs work", className: "bg-sev-major/12 text-sev-major-text" },
  avoided: { label: "Rarely used", className: "border-dashed border-border bg-transparent text-muted-foreground" },
  not_enough_data: { label: "Not enough data", className: "bg-muted text-muted-foreground" },
};

export function TensePanel({ stats }: { stats: TenseStats }) {
  if (stats.tenses.length === 0) {
    return <p className="text-sm text-muted-foreground">No verbs in this period yet.</p>;
  }

  const confusions = stats.tenses
    .flatMap((t) => t.confusedWith.map((c) => ({ needed: t.tense, used: c.tense, count: c.count, example: c.example })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <Summary tenses={stats.tenses} />
      {stats.unclassified > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.unclassified} verb {stats.unclassified === 1 ? "mistake is" : "mistakes are"} still being classified
          and {stats.unclassified === 1 ? "isn’t" : "aren’t"} counted yet.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-normal">Tense</th>
              <th className="py-2 pr-4 text-right font-normal">Uses</th>
              <th className="py-2 pr-4 font-normal">Accuracy</th>
              <th className="py-2 pr-4 font-normal">Mistakes</th>
              <th className="py-2 pr-4 font-normal">Trend</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          {FAMILIES.map((family) => {
            const rows = family.tenses.flatMap((tense) => stats.tenses.filter((t) => t.tense === tense));
            if (rows.length === 0) return null;
            return (
              <tbody key={family.title}>
                <tr>
                  <td colSpan={6} className="pt-3 pb-1 text-sm font-medium text-muted-foreground">
                    {family.title}
                  </td>
                </tr>
                {rows.map((t) => (
                  <Row key={t.tense} stat={t} />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {confusions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Your most common confusions</h3>
          <ul className="divide-y">
            {confusions.map((c) => (
              <li key={`${c.needed}/${c.used}`} className="flex gap-4 py-2 text-sm first:pt-0 last:pb-0">
                <div className="w-8 shrink-0 text-right font-semibold tabular-nums">{c.count}×</div>
                <div className="min-w-0 space-y-0.5">
                  <div>
                    <span className="font-medium">{TENSE_LABELS[c.used]}</span>{" "}
                    <span className="text-muted-foreground">instead of</span>{" "}
                    <span className="font-medium">{TENSE_LABELS[c.needed].toLowerCase()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-mark-wrong line-through">{c.example.original}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="text-mark-right">{c.example.correction}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ stat: t }: { stat: TenseStat }) {
  const mistakes = [
    t.usageErrors > 0 && `${t.usageErrors} wrong tense`,
    t.formErrors > 0 && `${t.formErrors} wrong form`,
  ].filter(Boolean);

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">{TENSE_LABELS[t.tense]}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{t.uses}</td>
      <td className="py-2 pr-4">
        {t.accuracy === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${t.accuracy}%` }} />
            </div>
            <span className="tabular-nums">{Math.round(t.accuracy)}%</span>
          </div>
        )}
      </td>
      <td className="py-2 pr-4 text-muted-foreground">{mistakes.length > 0 ? mistakes.join(" · ") : "—"}</td>
      <td className="py-2 pr-4">
        <Trend value={t.trend} />
      </td>
      <td className="py-2">
        <Badge variant="secondary" className={cn(STATUS[t.status].className)}>
          {STATUS[t.status].label}
        </Badge>
      </td>
    </tr>
  );
}

/** One line with the strongest tense, the one that needs the most work and the ones barely used. */
function Summary({ tenses }: { tenses: TenseStat[] }) {
  const measured = tenses.filter((t) => t.uses >= MIN_USES);
  const strongest = [...measured].sort((a, b) => b.smoothedAccuracy - a.smoothedAccuracy)[0];
  const weakest = [...measured]
    .filter((t) => t.usageErrors + t.formErrors > 0 && t !== strongest)
    .sort((a, b) => a.smoothedAccuracy - b.smoothedAccuracy)[0];
  const avoided = tenses.filter((t) => t.status === "avoided");

  const parts: React.ReactNode[] = [];
  if (strongest) {
    parts.push(
      <span key="strong">
        Strongest: <strong>{TENSE_LABELS[strongest.tense].toLowerCase()}</strong> ({Math.round(strongest.accuracy ?? 0)}
        %).
      </span>,
    );
  }
  if (weakest) {
    const confusion = weakest.confusedWith[0];
    parts.push(
      <span key="weak">
        {" "}
        Needs work: <strong>{TENSE_LABELS[weakest.tense].toLowerCase()}</strong> ({Math.round(weakest.accuracy ?? 0)}%
        {confusion && `, often ${TENSE_LABELS[confusion.tense].toLowerCase()} instead`}).
      </span>,
    );
  }
  if (avoided.length > 0) {
    parts.push(
      <span key="avoided">
        {" "}
        Rarely used: {avoided.map((t) => TENSE_LABELS[t.tense].toLowerCase()).join(", ")}. Try using them on purpose.
      </span>,
    );
  }
  if (parts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keep writing: each tense needs at least {MIN_USES} uses before its accuracy means something.
      </p>
    );
  }
  return <p className="text-sm">{parts}</p>;
}

/** Accuracy trend: higher is better. Icon + text, never color alone. */
function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(value) < 1) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="size-3.5" /> Stable
      </span>
    );
  }
  return value > 0 ? (
    <span className="flex items-center gap-1 text-mark-right">
      <ArrowUpRight className="size-3.5" /> +{Math.round(value)} pts
    </span>
  ) : (
    <span className="flex items-center gap-1 text-mark-wrong">
      <ArrowDownRight className="size-3.5" /> {Math.round(value)} pts
    </span>
  );
}
