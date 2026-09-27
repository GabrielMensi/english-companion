import { Cpu } from "lucide-react";
import type { FallbackAttempt } from "@/lib/ai/fallback";
import { modelLabel } from "@/lib/ai/provider-info";

/**
 * Small caption saying which model produced a response, how long it took and
 * which models failed before it.
 */
export function ModelNote({
  verb,
  provider,
  model,
  durationMs,
  fallbackAttempts,
}: {
  verb: string;
  provider: string | null;
  model: string | null;
  durationMs?: number | null;
  fallbackAttempts?: FallbackAttempt[] | null;
}) {
  if (!provider || !model) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <Cpu className="size-3" />
      {verb} {modelLabel(provider, model)}
      {durationMs != null && <span title="Response time">· {formatDuration(durationMs)}</span>}
      {fallbackAttempts && fallbackAttempts.length > 0 && (
        <span>
          · after {fallbackAttempts.map((a) => `${modelLabel(a.provider, a.model)} failed (${a.reason})`).join(", ")}
        </span>
      )}
    </p>
  );
}

/** 850 → "0.9s", 7240 → "7.2s", 65000 → "1m 5s". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}
