"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { SuspendedCard } from "@/lib/flashcards-upkeep";

const DECK_LABELS: Record<string, string> = { vocabulary: "Vocabulary", mistake: "Mistake", exercise: "Exercise" };

/** Cards the learner suspended, with a button to bring each one back to its deck. */
export function SuspendedCards({ cards }: { cards: SuspendedCard[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (cards.length === 0) return null;

  async function unsuspend(card: SuspendedCard) {
    const id = `${card.kind}:${card.key}`;
    setBusy(id);
    try {
      await api("/api/flashcards/cards", { method: "PATCH", body: { kind: card.kind, key: card.key, suspended: false } });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer font-medium select-none">
        Suspended cards <span className="text-sm font-normal text-muted-foreground">({cards.length})</span>
      </summary>
      <p className="text-sm text-muted-foreground">
        They don’t show up in any deck. Unsuspend one to review it again, with the progress it had.
      </p>
      <ul className="divide-y rounded-xl border bg-card">
        {cards.map((card) => {
          const id = `${card.kind}:${card.key}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="mr-2 text-xs text-muted-foreground">{DECK_LABELS[card.kind] ?? card.kind}</span>
                <span className="font-medium">{card.front}</span>
                {card.back && <span className="text-muted-foreground"> → {card.back}</span>}
              </div>
              <Button variant="ghost" size="sm" disabled={busy === id} onClick={() => unsuspend(card)}>
                <PlayCircle /> Unsuspend
              </Button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
