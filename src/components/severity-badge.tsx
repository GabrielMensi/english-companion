import { Badge } from "@/components/ui/badge";
import { type Severity, SEVERITY_LABELS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export const SEVERITY_CLASSES: Record<Severity, string> = {
  suggestion: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  typo: "bg-muted text-muted-foreground",
  minor: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  moderate: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  major: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function SeverityBadge({
  severity,
  className,
  children,
}: {
  severity: Severity;
  className?: string;
  /** Extra content shown after the label, e.g. a count. */
  children?: React.ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn(SEVERITY_CLASSES[severity], className)}>
      {SEVERITY_LABELS[severity]}
      {children !== undefined && <span className="tabular-nums opacity-80">{children}</span>}
    </Badge>
  );
}
