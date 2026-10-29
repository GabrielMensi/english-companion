"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Session, SessionMode } from "@/db/schema";
import { api } from "@/lib/api";
import { voided } from "@/lib/voided";

export function NewChatButton({
  mode = "correction",
  label = "New chat",
  variant = "default",
  iconOnly = false,
  className,
  ...props
}: {
  mode?: SessionMode;
  label?: string;
  variant?: "default" | "outline";
  /** Square icon button, for the collapsed sidebar. */
  iconOnly?: boolean;
  className?: string;
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "variant">) {
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
    <Button
      // Extra props (e.g. from a tooltip trigger) go to the underlying button.
      {...props}
      onClick={voided(create)}
      disabled={pending}
      variant={variant}
      size={iconOnly ? "icon-sm" : "default"}
      aria-label={iconOnly ? label : undefined}
      className={className}
    >
      <Plus />
      {!iconOnly && label}
    </Button>
  );
}
