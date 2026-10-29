"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ImportSummary {
  added: Record<string, number>;
  skipped: number;
  dropped: number;
  settingsAdded: number;
}

/** Export the account's data to a file, or add a file from another install to it. API keys are never included. */
export function DataTransfer() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      const summary = data as ImportSummary;
      const added = Object.values(summary.added).reduce((a, b) => a + b, 0);
      toast.success(
        added === 0
          ? "Nothing new to import: it was all here already"
          : `Imported ${added} item${added === 1 ? "" : "s"}${summary.skipped ? `, ${summary.skipped} already here` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t import the file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-section font-semibold tracking-tight">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Export your chats, mistakes, vocabulary, flashcards and settings to a file, for example to move to another
          computer. API keys are never included. Importing adds to what you have and can be repeated safely.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/api/data/export" download>
            <Download className="size-4" /> Export
          </a>
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Import
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Export file to import"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>
    </section>
  );
}
