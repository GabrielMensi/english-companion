"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NEEDS_API_KEY } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import type { Session } from "@/db/schema";
import { api } from "@/lib/api";
import type { ErrorCategory, Tense } from "@/lib/taxonomy";
import type { ExerciseKind } from "@/lib/tense-practice";

export type StartPracticeRequest =
  | { kind: ExerciseKind | "conversation"; tense: Tense; contrastWith: Tense | null }
  | { kind: "category"; category: ErrorCategory; subtype: string | null };

/** Creates a practice chat and opens it. Generating exercises takes a few seconds. */
export function StartPracticeButton({
  request,
  children,
  variant = "default",
  disabled,
  hasModel = true,
}: {
  request: StartPracticeRequest;
  children: React.ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
  /** Whether an AI provider is set up. Without one, exercises can't be generated (conversations still start). */
  hasModel?: boolean;
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

  const needsKey = !hasModel && request.kind !== "conversation";

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={start}
      disabled={pending || disabled || needsKey}
      title={needsKey ? NEEDS_API_KEY : undefined}
    >
      {pending && <Loader2 className="animate-spin" />}
      {pending && request.kind !== "conversation" ? "Preparing exercises…" : children}
    </Button>
  );
}
