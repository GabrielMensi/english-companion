"use client";

import { Cpu, MoreHorizontal, PictureInPicture2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionMode } from "@/db/schema";
import { modelLabel, type ProviderId } from "@/lib/ai/provider-info";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ModelOption {
  provider: ProviderId;
  model: string;
}

const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: "correction", label: "Correction", hint: "Corrections only" },
  { value: "conversation", label: "Conversation", hint: "Corrects you and replies" },
];

/** The chat's main choice, always visible: corrections only, or a conversation. */
export function ModeSwitch({ value, onChange }: { value: SessionMode; onChange: (mode: SessionMode) => void }) {
  return (
    <div role="group" aria-label="Chat mode" className="flex rounded-lg border p-0.5">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={value === m.value}
          title={m.hint}
          onClick={() => value !== m.value && onChange(m.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
            value === m.value && "bg-primary font-medium text-primary-foreground hover:text-primary-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Less frequent options: the model that corrects (a global setting) and the
 * floating window.
 */
export function ChatMenu({
  models,
  selected,
  pip,
}: {
  models: ModelOption[];
  selected: ProviderId;
  /** Null when the browser can't pop out a window. */
  pip: { open: boolean; toggle: () => void } | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(selected);
  const current = models.find((m) => m.provider === value);

  async function changeModel(provider: ProviderId) {
    const previous = value;
    setValue(provider);
    try {
      await api("/api/settings", { method: "PATCH", body: { provider } });
      router.refresh();
    } catch (error) {
      setValue(previous);
      toast.error((error as Error).message);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Chat options"
          title={current ? `Model: ${modelLabel(current.provider, current.model)}` : "Chat options"}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-muted-foreground">
          <Cpu className="size-3.5" />
          Model that corrects
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => void changeModel(v as ProviderId)}>
          {models.map((m) => (
            <DropdownMenuRadioItem key={m.provider} value={m.provider}>
              {modelLabel(m.provider, m.model)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {pip && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={pip.toggle}>
              <PictureInPicture2 />
              {pip.open ? "Bring the composer back" : "Pop out to a floating window"}
              <DropdownMenuShortcut>Alt+P</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
