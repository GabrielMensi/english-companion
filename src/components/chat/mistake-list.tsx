"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { ClassificationDialog } from "@/components/chat/classification-dialog";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { groupMistakes } from "@/lib/correction-marks";
import { categoryLabel, SEVERITY_LABELS, subtypeLabel, tenseLabel } from "@/lib/taxonomy";
import type { ChatCorrection } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  onUpdate,
}: {
  mistakes: ChatCorrection[];
  numbers: Map<string, number>;
  /** The floating window: no severity badges, no "Wrong type?", every mistake visible. */
  compact?: boolean;
  onUpdate?: (c: ChatCorrection) => void;
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
  onUpdate,
}: {
  title: string;
  items: ChatCorrection[];
  numbers: Map<string, number>;
  compact: boolean;
  onUpdate?: (c: ChatCorrection) => void;
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
          <MistakeItem key={e.id} error={e} number={numbers.get(e.id)} compact={compact} onUpdate={onUpdate} />
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
  onUpdate,
}: {
  error: ChatCorrection;
  number?: number;
  compact?: boolean;
  onUpdate?: (c: ChatCorrection) => void;
}) {
  const [editing, setEditing] = useState(false);
  const rawSubtype = subtypeLabel(e.category, e.subtype);
  // A typo classified as "Typo" would just repeat its badge.
  const subtype = rawSubtype?.toLowerCase() === SEVERITY_LABELS[e.severity].toLowerCase() ? null : rawSubtype;
  const tense = tenseLabel(e.tense);
  const tenseUsed = tenseLabel(e.tenseUsed);
  const detail = [subtype, tense && (tenseUsed ? `${tenseUsed} used instead of ${tense.toLowerCase()}` : tense)]
    .filter(Boolean)
    .join(". ");

  return (
    <li className="group flex gap-2 text-sm">
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
          <span className="font-serif text-base font-medium text-mark-right">{e.correction}</span>
          {!compact && <SeverityBadge severity={e.severity} />}
          {!compact && onUpdate && (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => setEditing(true)}
            >
              Wrong type?
            </Button>
          )}
        </div>
        {detail && !compact && <p className="text-xs text-muted-foreground">{detail}</p>}
        <p className="text-muted-foreground">{e.explanation}</p>
      </div>
      {editing && onUpdate && (
        <ClassificationDialog correction={e} open={editing} onOpenChange={setEditing} onSaved={onUpdate} />
      )}
    </li>
  );
}
