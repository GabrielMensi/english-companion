"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { discardCorrection, restoreCorrection } from "@/lib/api";

/**
 * "Discard" on a mistake the dashboard lists: the model got it wrong, so it
 * leaves the stats (the page is computed again), with Undo in the toast.
 */
export function DiscardButton({
  correctionId,
  label = "Discard",
  title = "Not a mistake: leave it out of your stats",
}: {
  correctionId: string;
  label?: string;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function discard() {
    setBusy(true);
    try {
      await discardCorrection(correctionId);
      router.refresh();
      toast("Discarded: it won’t count in your stats", {
        action: {
          label: "Undo",
          onClick: () => {
            restoreCorrection(correctionId)
              .then(() => router.refresh())
              .catch((error: Error) => toast.error(error.message));
          },
        },
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={discard} disabled={busy} title={title}>
      {busy && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}
