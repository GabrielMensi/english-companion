"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Session } from "@/db/schema";
import { api } from "@/lib/api";
import type { Tense } from "@/lib/taxonomy";
import type { ExerciseKind } from "@/lib/tense-practice";

export interface StartPracticeRequest {
  kind: ExerciseKind | "conversation";
  tense: Tense;
  contrastWith: Tense | null;
}

/** Creates a practice chat and opens it. Generating exercises can take a while with local models. */
export function StartPracticeButton({
  request,
  children,
  variant = "default",
  disabled,
}: {
  request: StartPracticeRequest;
  children: React.ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const session = await api<Session>("/api/practice", { body: request });
      router.push(`/chat/${session.id}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
      setPending(false);
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={start} disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {pending && request.kind !== "conversation" ? "Preparing exercises…" : children}
    </Button>
  );
}
