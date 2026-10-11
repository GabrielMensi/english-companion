import { KeyRound } from "lucide-react";
import Link from "next/link";
import { NO_PROVIDER_MESSAGE } from "@/lib/ai/fallback";
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

/** Tooltip for an AI action that is disabled because no provider has an API key. */
export const NEEDS_API_KEY = "Needs a Gemini or Groq API key (Settings)";
