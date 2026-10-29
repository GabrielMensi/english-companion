"use client";

import { Loader2, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Session } from "@/db/schema";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TENSE_LABELS, TENSES } from "@/lib/taxonomy";
import { TOPIC_MAX_LENGTH, TOPIC_PRESETS } from "@/lib/topics";

/** Starts a conversation about a topic: one from the list, or one the learner types. */
export function TalkAboutButton({
  label = "Talk about…",
  variant = "outline",
  iconOnly = false,
  className,
  ...props
}: {
  label?: string;
  variant?: "default" | "outline" | "ghost";
  /** Square icon button, for the sidebar. */
  iconOnly?: boolean;
  className?: string;
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "variant">) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  /** A tense to practice in the conversation, or "none". */
  const [tense, setTense] = useState("none");
  /** The preset being started, or "custom". */
  const [pending, setPending] = useState<string | null>(null);

  async function start(preset: string | null) {
    setPending(preset ?? "custom");
    try {
      const session = await api<Session>("/api/practice", {
        body: { kind: "topic", preset, topic: custom, tense: tense === "none" ? null : tense },
      });
      setOpen(false);
      setCustom("");
      router.push(`/chat/${session.id}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          // Extra props (e.g. from a tooltip trigger) go to the underlying button.
          {...props}
          variant={variant}
          size={iconOnly ? "icon-sm" : "default"}
          aria-label={iconOnly ? label : undefined}
          className={className}
        >
          <MessageSquareText />
          {!iconOnly && label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Talk about…</DialogTitle>
          <DialogDescription>
            Pick a topic or type your own. The tutor keeps the conversation on it and corrects you as usual.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Also practice</span>
          <Select value={tense} onValueChange={setTense}>
            <SelectTrigger size="sm" aria-label="Tense to practice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tense in particular</SelectItem>
              {TENSES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TENSE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul className="grid gap-2" aria-busy={pending !== null}>
          {TOPIC_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => void start(preset.id)}
                disabled={pending !== null}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{preset.label}</span>
                  <span className="block text-sm text-muted-foreground">{preset.description}</span>
                </span>
                {pending === preset.id && (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span className="sr-only">Starting…</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start(null);
          }}
          className="flex gap-2"
        >
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or type a topic, e.g. football, my last trip"
            maxLength={TOPIC_MAX_LENGTH}
            aria-label="Custom topic"
          />
          <Button type="submit" disabled={!custom.trim() || pending !== null}>
            {pending === "custom" && <Loader2 className="animate-spin" aria-hidden />}
            {pending === "custom" ? "Starting…" : "Start"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
