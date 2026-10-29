"use client";

import { ArrowRight, FileText, Loader2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ClassBadge } from "@/components/class-badge";
import { NeedsKeyHint } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { ClassImport } from "@/lib/class-core";
import { MAX_CLASS_TEXT } from "@/lib/class-core";
import type { ClassSessionView } from "@/lib/class";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/insights/level-core";
import { categoryLabel, type ErrorCategory } from "@/lib/taxonomy";
import { voided } from "@/lib/voided";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** `YYYY-MM-DDTHH:mm` in local time, the format of `<input type="datetime-local">`. */
function localInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function LevelSelect({
  value,
  onChange,
  label,
}: {
  value: CefrLevel | null;
  onChange: (level: CefrLevel | null) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className={selectClass}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as CefrLevel | null)}
    >
      <option value="">Not given</option>
      {CEFR_LEVELS.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

/** The classes with the teacher: add one, give the level the teacher said, and load what they corrected. */
export function ClassManager({ classes, hasModel }: { classes: ClassSessionView[]; hasModel: boolean }) {
  return (
    <div className="space-y-6">
      <NewClass />
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No classes yet. Add the first one above.</p>
      ) : (
        <ul className="space-y-4">
          {classes.map((c) => (
            <ClassCard key={c.id} item={c} hasModel={hasModel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewClass() {
  const router = useRouter();
  const [when, setWhen] = useState(() => localInputValue(Date.now()));
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    const heldAt = new Date(when).getTime();
    if (Number.isNaN(heldAt)) return toast.error("Pick the date of the class");
    setSaving(true);
    try {
      await api("/api/class", { body: { heldAt, teacherLevel: level, notes: notes.trim() || null } });
      setNotes("");
      setLevel(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">When was the class</span>
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-56" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block text-muted-foreground">Teacher’s level</span>
        <LevelSelect value={level} onChange={setLevel} label="Teacher’s level" />
      </label>
      <label className="min-w-48 flex-1 space-y-1 text-sm">
        <span className="text-muted-foreground">Notes (optional)</span>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          placeholder="Unit 4, past perfect"
        />
      </label>
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        Add class
      </Button>
    </form>
  );
}

function ClassCard({ item, hasModel }: { item: ClassSessionView; hasModel: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function setLevel(teacherLevel: CefrLevel | null) {
    try {
      await api(`/api/class/${item.id}`, { method: "PATCH", body: { teacherLevel } });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the level");
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await api(`/api/class/${item.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the class");
    }
  }

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{dateFormat.format(item.heldAt)}</h3>
          {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LevelSelect value={item.teacherLevel} onChange={voided(setLevel)} label="Teacher’s level" />
          <Button asChild variant="outline" size="sm">
            <Link href={`/class/report?since=${item.id}`}>
              <FileText /> Report since this class
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={voided(remove)} onBlur={() => setConfirmDelete(false)}>
            <Trash2 />
            <span className="sr-only">{confirmDelete ? "Click again to delete the class" : "Delete the class"}</span>
          </Button>
        </div>
      </div>
      {confirmDelete && (
        <p className="text-sm text-destructive">
          Click the bin again to delete this class and everything loaded from it.
        </p>
      )}

      {(item.corrections.length > 0 || item.words.length > 0) && (
        <ul className="space-y-1.5 text-sm">
          {item.corrections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="text-mark-wrong line-through">{c.original}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="text-mark-right">{c.correction}</span>
              <span className="text-xs text-muted-foreground">{categoryLabel(c.category as ErrorCategory)}</span>
              <ClassBadge />
            </li>
          ))}
          {item.words.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{w.english.join(" / ")}</span>
              <span className="text-muted-foreground">{w.spanish}</span>
              <ClassBadge />
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <LoadPanel classId={item.id} hasModel={hasModel} onClose={() => setLoading(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setLoading(true)}>
          Load the teacher’s corrections
        </Button>
      )}
    </li>
  );
}

function LoadPanel({ classId, hasModel, onClose }: { classId: string; hasModel: boolean; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [spokenWords, setSpokenWords] = useState("");
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [items, setItems] = useState<ClassImport | null>(null);

  async function structure() {
    setBusy("parse");
    try {
      setItems(await api<ClassImport>(`/api/class/${classId}/parse`, { body: { text } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read the notes");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!items) return;
    setBusy("save");
    try {
      const words = Number(spokenWords);
      await api(`/api/class/${classId}/items`, {
        body: { ...items, spokenWords: Number.isInteger(words) && words > 0 ? words : null },
      });
      toast.success("Saved: they now count in your stats and flashcards");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  const empty = items !== null && items.corrections.length === 0 && items.words.length === 0;

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      {!items ? (
        <>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              Paste or type what the teacher corrected and the new words, in any format. The AI sorts them into the
              app’s mistake types.
            </span>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_CLASS_TEXT}
              rows={7}
              placeholder={"I have went → I went (past simple)\nI'm agree → I agree\nNew word: bucket list"}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <NeedsKeyHint active={!hasModel}>
              <Button onClick={voided(structure)} disabled={busy !== null || !text.trim() || !hasModel}>
                {busy === "parse" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Structure with AI
              </Button>
            </NeedsKeyHint>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Check what the AI found. Remove what is wrong, then save: these count in your stats and become flashcards.
          </p>
          {empty && <p className="text-sm">Nothing found in those notes.</p>}
          <ul className="space-y-1.5 text-sm">
            {items.corrections.map((c, i) => (
              <li key={`${c.original}-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="text-mark-wrong line-through">{c.original}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="text-mark-right">{c.correction}</span>
                <span className="text-xs text-muted-foreground">{categoryLabel(c.category)}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove"
                  onClick={() => setItems({ ...items, corrections: items.corrections.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </li>
            ))}
            {items.words.map((w, i) => (
              <li key={`${w.spanish}-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{w.english.join(" / ")}</span>
                <span className="text-muted-foreground">{w.spanish}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove"
                  onClick={() => setItems({ ...items, words: items.words.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">About how many words did you speak? (optional)</span>
            <Input
              type="number"
              min={0}
              value={spokenWords}
              onChange={(e) => setSpokenWords(e.target.value)}
              className="w-24"
              placeholder="auto"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={voided(save)} disabled={busy !== null || empty}>
              {busy === "save" && <Loader2 className="animate-spin" />}
              Save as “From class”
            </Button>
            <Button variant="ghost" onClick={() => setItems(null)}>
              Back to the notes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
