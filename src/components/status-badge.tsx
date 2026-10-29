import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * How a status reads, on the same warm ramp as mistake severity so the same
 * color means the same thing everywhere: red is a problem, amber is shaky,
 * green is fine, and a dashed outline is optional or just informative.
 */
export type Tone = "bad" | "warn" | "good" | "neutral" | "optional";

export const TONE_CLASSES: Record<Tone, string> = {
  bad: "bg-sev-major/12 text-sev-major-text",
  warn: "bg-sev-minor/18 text-sev-minor-text",
  good: "bg-mark-right/12 text-mark-right",
  neutral: "bg-muted text-muted-foreground",
  optional: "border-dashed border-border bg-transparent text-muted-foreground",
};

export function StatusBadge({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn(TONE_CLASSES[tone], className)}>
      {children}
    </Badge>
  );
}
