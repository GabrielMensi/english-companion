import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Where a page belongs in the learning loop. It tints the page's primary
 * actions and title mark (see `[data-area]` in globals.css); data never uses it.
 */
export type Area = "write" | "review" | "train";

const WIDTHS = { md: "max-w-2xl", lg: "max-w-3xl", xl: "max-w-4xl", "2xl": "max-w-5xl" } as const;

export function Page({
  area,
  width = "lg",
  children,
}: {
  area?: Area;
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <div data-area={area} className="flex-1 overflow-y-auto">
      <div className={cn("mx-auto space-y-8 px-6 py-8", WIDTHS[width])}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  leading,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  /** Before the title, e.g. a back link. */
  leading?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0 border-l-[3px] border-primary pl-4">
          <h1 className="text-title font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-[68ch] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A section of a page. Framed sections hold one tool or chart; unframed ones
 * group a list of items that carry their own frames.
 */
export function Section({
  title,
  description,
  action,
  framed = true,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  framed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4", framed && "rounded-xl border bg-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-section font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 max-w-[68ch] text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A quiet text link in a section header, e.g. "See all words". */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
