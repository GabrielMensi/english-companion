import { Badge } from "@/components/ui/badge";
import { type Severity, SEVERITY_LABELS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export const SEVERITY_CLASSES: Record<Severity, string> = {
  suggestion: "border-dashed border-border bg-transparent text-muted-foreground",
  typo: "bg-muted text-muted-foreground",
  minor: "bg-sev-minor/18 text-sev-minor-text",
  moderate: "bg-sev-moderate/15 text-sev-moderate-text",
  major: "bg-sev-major/12 text-sev-major-text",
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
