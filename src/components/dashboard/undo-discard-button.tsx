"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreCorrection } from "@/lib/api";
import { voided } from "@/lib/voided";

/** "Undo" on a discarded mistake: it counts in the stats again and leaves the list (the page is computed again). */
export function UndoDiscardButton({ correctionId, label }: { correctionId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function undo() {
    setBusy(true);
    try {
      await restoreCorrection(correctionId);
      router.refresh();
      toast("Restored: it counts in your stats again");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="xs" onClick={voided(undo)} disabled={busy} aria-label={`Undo discard: ${label}`}>
      {busy && <Loader2 className="animate-spin" />}
      Undo
    </Button>
  );
}
