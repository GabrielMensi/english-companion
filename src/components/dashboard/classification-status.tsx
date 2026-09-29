"use client";

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ClassificationStatus as Status } from "@/lib/classification";

const POLL_MS = 3000;

/**
 * Starts the deferred classification when the dashboard opens and refreshes
 * the page once it's done, so the detailed stats fill in without blocking it.
 */
export function ClassificationStatus({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const hadPending = useRef(initial.pending > 0);

  useEffect(() => {
    if (initial.pending === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll(start: boolean) {
      try {
        const next = await api<Status>("/api/classification", start ? { method: "POST" } : undefined);
        if (stopped) return;
        setStatus(next);
        if (next.running) {
          timer = setTimeout(() => poll(false), POLL_MS);
        } else if (hadPending.current) {
          hadPending.current = false;
          router.refresh();
        }
      } catch {
        // The status is informative only; the next visit tries again.
      }
    }

    poll(true);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [initial.pending, router]);

  async function retry() {
    hadPending.current = true;
    const next = await api<Status>("/api/classification", { body: { retryFailed: true } });
    setStatus(next);
    if (next.running) setTimeout(() => router.refresh(), POLL_MS);
  }

  if (status.running) {
    return (
      <Banner>
        <Loader2 className="size-4 animate-spin" />
        Classifying {status.pending} {status.pending === 1 ? "mistake" : "mistakes"} in detail… The main types will
        update when it’s done.
      </Banner>
    );
  }

  if (status.lastError && status.pending > 0) {
    return (
      <Banner>
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {status.pending} {status.pending === 1 ? "mistake isn’t" : "mistakes aren’t"} classified in detail yet:{" "}
          {status.lastError}
        </span>
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCcw /> Retry
        </Button>
      </Banner>
    );
  }

  if (status.failed > 0) {
    return (
      <Banner>
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {status.failed} {status.failed === 1 ? "mistake" : "mistakes"} couldn’t be classified in detail.
        </span>
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCcw /> Retry
        </Button>
      </Banner>
    );
  }

  return null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
