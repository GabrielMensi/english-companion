"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Session, SessionMode } from "@/db/schema";
import { api } from "@/lib/api";

export function NewChatButton({
  mode = "correction",
  label = "Nuevo chat",
  variant = "default",
  className,
}: {
  mode?: SessionMode;
  label?: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      const session = await api<Session>("/api/sessions", { body: { mode } });
      router.push(`/chat/${session.id}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={create} disabled={pending} variant={variant} className={className}>
      <Plus />
      {label}
    </Button>
  );
}
