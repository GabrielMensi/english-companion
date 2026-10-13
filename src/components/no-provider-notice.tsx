import { KeyRound } from "lucide-react";
import Link from "next/link";
import { NEEDS_API_KEY, NO_PROVIDER_MESSAGE } from "@/lib/ai/provider-info";
import { cn } from "@/lib/utils";

/** Shown where AI features live when no provider has an API key (see `hasConfiguredProvider`). */
export function NoProviderNotice({ detail, className }: { detail?: string; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <KeyRound className="size-4 shrink-0" />
      <span>
        {NO_PROVIDER_MESSAGE}
        {detail && ` ${detail}`}{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Open Settings
        </Link>
      </span>
    </p>
  );
}

/**
 * Explains, on hover, why an AI action is disabled. The tooltip sits on a wrapper because disabled
 * buttons ignore the pointer (`disabled:pointer-events-none`), so their own `title` never shows.
 */
export function NeedsKeyHint({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return children;
  return (
    <span title={NEEDS_API_KEY} className="inline-flex">
      {children}
    </span>
  );
}
