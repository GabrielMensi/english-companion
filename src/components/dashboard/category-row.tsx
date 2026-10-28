"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DiscardButton } from "@/components/dashboard/discard-button";
import { SeverityBadge } from "@/components/severity-badge";
import type { CategoryStat } from "@/lib/stats-core";
import { categoryLabel } from "@/lib/taxonomy";
import { subtypeLabel } from "@/lib/subtypes";
import { cn } from "@/lib/utils";

/** A row of the category table that opens to list its latest mistakes, each one with "Discard". */
export function CategoryRow({ stat: c, trend }: { stat: CategoryStat; trend: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const canOpen = c.recent.length > 0;

  return (
    <>
      <tr className={cn("border-b", !open && "last:border-0")}>
        <td className="py-2 pr-4">
          {canOpen ? (
            <button
              type="button"
              className="flex items-center gap-1 text-left hover:underline"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
              {categoryLabel(c.category)}
            </button>
          ) : (
            <span className="pl-4.5">{categoryLabel(c.category)}</span>
          )}
        </td>
        <td className="py-2 pr-4 text-right tabular-nums">{c.count}</td>
        <td className="py-2 pr-4 text-right tabular-nums">{c.bySeverity.major}</td>
        <td className="py-2 pr-4 text-right tabular-nums">{c.per100Words}</td>
        <td className="py-2 pr-4 text-muted-foreground">
          {c.topSubtypes.length === 0
            ? "—"
            : c.topSubtypes.map((t) => `${subtypeLabel(c.category, t.subtype) ?? t.subtype} (${t.count})`).join(", ")}
        </td>
        <td className="py-2">{trend}</td>
      </tr>
      {open && (
        <tr className="border-b last:border-0">
          <td colSpan={6} className="pt-1 pb-3 pl-5">
            <p className="mb-2 text-xs text-muted-foreground">
              {c.count > c.recent.length ? `The latest ${c.recent.length} of ${c.count}` : "All of them"}. Discard the
              ones that weren’t mistakes.
            </p>
            <ul className="flex flex-col gap-2">
              {c.recent.map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-mark-wrong line-through">{m.original}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="text-mark-right">{m.correction}</span>
                    <SeverityBadge severity={m.severity} />
                    <DiscardButton correctionId={m.id} />
                  </div>
                  <p className="text-muted-foreground">{m.explanation}</p>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
