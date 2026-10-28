"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClassificationDialog } from "@/components/chat/classification-dialog";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { discardCorrection, restoreCorrection } from "@/lib/api";
import { groupMistakes } from "@/lib/correction-marks";
import { categoryLabel, SEVERITY_LABELS, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
import type { ChatCorrection, CorrectionUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { voided } from "@/lib/voided";

/** Mistakes shown per category before "Show more". */
const VISIBLE_PER_GROUP = 3;

/**
 * Mistakes grouped by category (what you learn from), most serious first.
 * Each one carries the reference number of its mark in the corrected text.
 */
export function MistakeGroups({
  mistakes,
  numbers,
  compact = false,
  highlight = null,
  onUpdate,
}: {
  mistakes: ChatCorrection[];
  numbers: Map<string, number>;
  /** The floating window: no severity badges, no "Wrong type?" or "Discard", every mistake visible. */
  compact?: boolean;
  /** A correction to point out for a moment, e.g. one just marked as a typo. */
  highlight?: string | null;
  onUpdate?: (update: CorrectionUpdate) => void;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
      {groupMistakes(mistakes).map((group) => (
        <MistakeGroup
          key={group.category}
          title={categoryLabel(group.category)}
          items={group.items}
          numbers={numbers}
          compact={compact}
          highlight={highlight}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function MistakeGroup({
  title,
  items,
  numbers,
  compact,
  highlight,
  onUpdate,
}: {
  title: string;
  items: ChatCorrection[];
  numbers: Map<string, number>;
  compact: boolean;
  highlight: string | null;
  onUpdate?: (update: CorrectionUpdate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = compact || expanded ? items : items.slice(0, VISIBLE_PER_GROUP);
  const hidden = items.length - visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        {items.length > 1 && <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>}
      </div>
      <ul className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
        {visible.map((e) => (
          <MistakeItem
            key={e.id}
            error={e}
            number={numbers.get(e.id)}
            compact={compact}
            highlighted={e.id === highlight}
            onUpdate={onUpdate}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="xs"
          className="self-start text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </Button>
      )}
    </div>
  );
}

export function MistakeItem({
  error: e,
  number,
  compact = false,
  highlighted = false,
  onUpdate,
}: {
  error: ChatCorrection;
  number?: number;
  compact?: boolean;
  highlighted?: boolean;
  /** Enables "Wrong type?" and "Discard" (or "Undo" once discarded). */
  onUpdate?: (update: CorrectionUpdate) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const discarded = e.discardedAt !== null;

  async function toggleDiscard() {
    if (!onUpdate) return;
    setBusy(true);
    try {
      onUpdate(await (discarded ? restoreCorrection(e.id) : discardCorrection(e.id)));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rawSubtype = subtypeLabel(e.category, e.subtype);
  // A typo classified as "Typo" would just repeat its badge.
  const subtype = rawSubtype?.toLowerCase() === SEVERITY_LABELS[e.severity].toLowerCase() ? null : rawSubtype;
  const tense = tenseLabel(e.tense);
  const tenseUsed = tenseLabel(e.tenseUsed);
  const detail = [subtype, tense && (tenseUsed ? `${tenseUsed} used instead of ${tense.toLowerCase()}` : tense)]
    .filter(Boolean)
    .join(". ");

  return (
    <li
      className={cn(
        "group flex gap-2 rounded-md text-sm transition-colors duration-700",
        highlighted && "bg-muted ring-4 ring-muted",
      )}
    >
      <span
        className="w-4 shrink-0 pt-1 text-right text-xs font-semibold text-muted-foreground tabular-nums"
        aria-label={number ? `Mark ${number}` : undefined}
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-serif text-base text-mark-wrong line-through">{e.original}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span
            className={cn(
              "font-serif text-base font-medium",
              discarded ? "text-muted-foreground line-through" : "text-mark-right",
            )}
          >
            {e.correction}
          </span>
          {!compact && <SeverityBadge severity={e.severity} className={cn(discarded && "opacity-60")} />}
          {!compact && onUpdate && !discarded && (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => setEditing(true)}
            >
              Wrong type?
            </Button>
          )}
          {!compact && onUpdate && (
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                "text-muted-foreground",
                !discarded && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
              onClick={voided(toggleDiscard)}
              disabled={busy}
              title={discarded ? undefined : "Not a mistake: leave it out of your stats"}
            >
              {busy && <Loader2 className="animate-spin" />}
              {discarded ? "Undo" : "Discard"}
            </Button>
          )}
        </div>
        {detail && !compact && <p className="text-xs text-muted-foreground">{detail}</p>}
        <p className={cn("text-muted-foreground", discarded && "line-through")}>{e.explanation}</p>
      </div>
      {editing && onUpdate && (
        <ClassificationDialog correction={e} open={editing} onOpenChange={setEditing} onSaved={onUpdate} />
      )}
    </li>
  );
}
