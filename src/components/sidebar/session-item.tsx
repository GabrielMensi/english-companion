"use client";

import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SessionItem({ session, active }: { session: SessionSummary; active: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(session.title);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api(`/api/sessions/${session.id}`, { method: "PATCH", body: { title } });
      setDialog(null);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function remove() {
    try {
      await api(`/api/sessions/${session.id}`, { method: "DELETE" });
      setDialog(null);
      if (active) router.push("/");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <li className="group relative">
      <Link
        href={`/chat/${session.id}`}
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm hover:bg-sidebar-accent",
          active && "bg-sidebar-accent font-medium",
        )}
      >
        <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{session.title}</span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Actions"
            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 aria-expanded:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() => {
              setTitle(session.title);
              setDialog("rename");
            }}
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form onSubmit={rename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename chat</DialogTitle>
            </DialogHeader>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
            <DialogFooter>
              <Button type="submit" disabled={!title.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>
              Its messages and corrections will be deleted and will no longer count in the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
