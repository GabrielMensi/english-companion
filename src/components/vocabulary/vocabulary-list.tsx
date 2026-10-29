"use client";

import { ClassBadge } from "@/components/class-badge";
import { MessageSquare, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SpeakButton } from "@/components/audio/speak-button";
import { Highlight } from "@/components/vocabulary/highlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { type VocabularyWord, wordKey } from "@/lib/vocabulary-core";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function VocabularyList({ initialWords }: { initialWords: VocabularyWord[] }) {
  const [words, setWords] = useState(initialWords);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = wordKey(query);
    if (!q) return words;
    return words.filter((w) => w.key.includes(q) || w.english.some((e) => e.toLowerCase().includes(q)));
  }, [words, query]);

  async function remove(word: VocabularyWord) {
    try {
      await api("/api/vocabulary", { method: "DELETE", body: { ids: word.ids } });
      setWords((prev) => prev.filter((w) => w.key !== word.key));
      toast.success(`Removed “${word.spanish}”`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (words.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        <p>No words yet.</p>
        <p className="mt-1 text-sm">
          When you don’t know how to say something, write it in Spanish between brackets:{" "}
          <code className="rounded bg-muted px-1">I want to [aprovechar] this</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Spanish or English"
            className="pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {words.length} {words.length === 1 ? "word" : "words"}
        </span>
      </div>

      <ul className="space-y-3">
        {filtered.map((w) => (
          <li key={w.key} className="group space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">{w.spanish}</div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-medium">{w.english.join(" / ")}</span>
                  <SpeakButton text={w.english.join(", ")} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {w.source === "class" && <ClassBadge />}
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {w.timesLookedUp > 1 ? `${w.timesLookedUp}× · ` : ""}
                  {dateFormat.format(w.lastSeen)}
                </span>
                <DeleteButton onConfirm={() => void remove(w)} />
              </div>
            </div>
            {w.note && <p className="text-sm text-muted-foreground">{w.note}</p>}
            <ul className="space-y-1">
              {w.contexts.map((c) => (
                <li key={c.messageId} className="flex items-start gap-2 text-sm">
                  <Link
                    href={`/chat/${c.sessionId}`}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Open chat"
                  >
                    <MessageSquare className="size-3.5" />
                  </Link>
                  <span className="line-clamp-2 italic">
                    <Highlight text={c.text} terms={w.english} />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No words match “{query}”.</p>}
      </ul>
    </div>
  );
}

/** Two-step delete: the first click asks for confirmation. */
function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <Button variant="destructive" size="xs" onClick={onConfirm} onBlur={() => setConfirming(false)} autoFocus>
      Delete?
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Delete word"
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      onClick={() => setConfirming(true)}
    >
      <Trash2 />
    </Button>
  );
}
