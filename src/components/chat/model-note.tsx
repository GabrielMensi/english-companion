import { Cpu } from "lucide-react";
import type { FallbackAttempt } from "@/lib/ai/fallback";
import { modelLabel } from "@/lib/ai/provider-info";

/** Small caption saying which model produced a response, and which ones failed before it. */
export function ModelNote({
  verb,
  provider,
  model,
  fallbackAttempts,
}: {
  verb: string;
  provider: string | null;
  model: string | null;
  fallbackAttempts?: FallbackAttempt[] | null;
}) {
  if (!provider || !model) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <Cpu className="size-3" />
      {verb} {modelLabel(provider, model)}
      {fallbackAttempts && fallbackAttempts.length > 0 && (
        <span>
          · after {fallbackAttempts.map((a) => `${modelLabel(a.provider, a.model)} failed (${a.reason})`).join(", ")}
        </span>
      )}
    </p>
  );
}
