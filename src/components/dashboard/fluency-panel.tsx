import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { FluencyStats } from "@/lib/fluency";

export function FluencyPanel({ stats }: { stats: FluencyStats }) {
  const { current, previous } = stats;
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        Dictate a message with the microphone (or hold Ctrl+Space) to see your pace, pauses and fillers.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Pace"
          unit="words per minute"
          value={current.wpm}
          previous={previous?.wpm ?? null}
          // Faster is better, up to a point: this is about fluency, not speed.
          higherIsBetter
          hint="Conversational English is around 120–160 wpm."
        />
        <Metric
          label="Long pauses"
          unit="per minute"
          value={current.pausesPerMinute}
          previous={previous?.pausesPerMinute ?? null}
          hint="Silences of a second or more between two words."
        />
        <Metric
          label="Fillers"
          unit="per 100 words"
          value={current.fillersPer100Words}
          previous={previous?.fillersPer100Words ?? null}
          hint={`${current.fillerCount} in ${stats.messages} spoken ${stats.messages === 1 ? "message" : "messages"}.`}
        />
      </div>

      {current.topFillers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Your fillers:</span>
          {current.topFillers.map((f) => (
            <span key={f.filler} className="rounded-lg border px-2.5 py-1">
              {f.filler}
              <span className="ml-1.5 text-xs text-muted-foreground">{f.count}×</span>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Measured from the transcription’s word timings. Whisper leaves out some hesitations (“um”, “eh”), so fillers are
        a lower bound.
      </p>
    </div>
  );
}

function Metric({
  label,
  unit,
  value,
  previous,
  higherIsBetter = false,
  hint,
}: {
  label: string;
  unit: string;
  value: number | null;
  previous: number | null;
  higherIsBetter?: boolean;
  hint: string;
}) {
  const delta = value !== null && previous !== null ? value - previous : null;
  const better = delta !== null && (higherIsBetter ? delta > 0 : delta < 0);

  return (
    <div className="space-y-1 rounded-xl border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums">{value === null ? "—" : fmt(value)}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {delta !== null && Math.abs(delta) >= 0.01 ? (
          <span className="flex items-center gap-0.5" title={hint}>
            {delta < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
            {fmt(Math.abs(delta))} {better ? "better" : "worse"} than the previous period
          </span>
        ) : (
          hint
        )}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
