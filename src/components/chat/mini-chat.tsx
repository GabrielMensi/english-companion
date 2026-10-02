"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  Loader2,
  MessageCircleHeart,
  Mic,
  RotateCcw,
  X,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { SpeakButton } from "@/components/audio/speak-button";
import { PUSH_TO_TALK_KEYS } from "@/components/audio/use-push-to-talk";
import { AnalysisPreviewView } from "@/components/chat/analysis-preview";
import { Composer, type ComposerState, type Notify } from "@/components/chat/composer";
import { DiffText } from "@/components/chat/diff-text";
import { CopyButton, copyText } from "@/components/copy-button";
import { FluencyNote } from "@/components/chat/user-message";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import type { SessionMode } from "@/db/schema";
import type { AnalysisPreview } from "@/lib/ai/analysis";
import { categoryLabel, SEVERITIES } from "@/lib/taxonomy";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Notice {
  kind: "error" | "info";
  message: string;
}

/**
 * The floating window's content: the last correction and the composer, so you can write or dictate
 * while working in another app. Radix popups and toasts portal into the main document (the hidden
 * tab), so this view avoids them: messages show inline as a `Notice`.
 */
export function MiniChat({
  title,
  mode,
  message,
  preview,
  reply,
  composer,
  canDictate,
  notice,
  onDismissNotice,
  notify,
  onRetry,
  onClose,
  voice,
}: {
  title: string;
  mode: SessionMode;
  /** The last message the user sent, if any. */
  message: ChatMessage | undefined;
  /** Its analysis while it streams. */
  preview: AnalysisPreview | undefined;
  /** The tutor's reply to it (conversation mode). */
  reply: ChatMessage | undefined;
  composer: ComposerState;
  canDictate: boolean;
  notice: Notice | null;
  onDismissNotice: () => void;
  notify: Notify;
  onRetry: (id: string) => void;
  onClose: () => void;
  /** Voice mode, shared with the tab; null when it isn't available (correction mode, no speech). */
  voice: { on: boolean; canTurnOn: boolean; toggle: () => void } | null;
}) {
  return (
    <div className="flex h-full flex-col text-sm">
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="truncate font-medium">{title}</span>
        <div className="flex shrink-0 items-center gap-2">
          {voice && (
            <Button
              variant={voice.on ? "secondary" : "ghost"}
              size="xs"
              onClick={voice.toggle}
              disabled={!voice.canTurnOn}
              aria-pressed={voice.on}
              title={
                voice.canTurnOn
                  ? `Voice mode: replies are read aloud, hold ${PUSH_TO_TALK_KEYS} to answer`
                  : "Voice mode needs a Groq API key for dictation: add it in Settings"
              }
            >
              <Headphones />
              Voice
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{mode === "conversation" ? "Conversation" : "Correction"}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {message ? (
          <LastCorrection message={message} preview={preview} reply={reply} notify={notify} onRetry={onRetry} onClose={onClose} />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            Write or dictate something in English: the correction shows up here, ready to copy.
          </p>
        )}
      </div>

      {notice && (
        <div
          className={cn(
            "mx-3 mb-2 flex items-start gap-2 rounded-lg border px-3 py-2",
            notice.kind === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/50",
          )}
        >
          <span className="flex-1">{notice.message}</span>
          <Button variant="ghost" size="icon-xs" onClick={onDismissNotice} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      )}

      <div className="border-t p-3">
        <Composer composer={composer} canDictate={canDictate} />
        {voice?.on && (
          <p className="mt-2 text-xs text-muted-foreground">
            Hold <kbd className="rounded border px-1 font-sans">{PUSH_TO_TALK_KEYS}</kbd> to talk, release to send.
            Replies are read aloud.
          </p>
        )}
      </div>
    </div>
  );
}

function LastCorrection({
  message,
  preview,
  reply,
  notify,
  onRetry,
  onClose,
}: {
  message: ChatMessage;
  preview: AnalysisPreview | undefined;
  reply: ChatMessage | undefined;
  notify: Notify;
  onRetry: (id: string) => void;
  onClose: () => void;
}) {
  const [showNative, setShowNative] = useShowNative();

  // The corrected text appears as it's written; the copy buttons wait for the final version.
  if (message.status === "pending" && preview?.correctedText) {
    return (
      <div className="flex flex-col gap-2">
        {!preview.correctedDone && (
          <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{message.content}</p>
        )}
        <AnalysisPreviewView original={message.content} preview={preview} compact />
      </div>
    );
  }

  if (message.status === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{message.content}</p>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Correcting…
        </div>
      </div>
    );
  }

  if (message.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{message.content}</p>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{message.errorMessage ?? "Couldn't analyze the message."}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => onRetry(message.id)}>
            <RotateCcw /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const corrected = message.correctedText ?? message.content;
  const errors = message.corrections.filter((c) => c.severity !== "suggestion");

  const copyFailed = () => notify("error", "Couldn't copy to the clipboard");

  return (
    <div className="flex flex-col gap-3">
      {errors.length === 0 ? (
        <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {corrected === message.content ? "Perfect! No mistakes." : "No mistakes."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {SEVERITIES.filter((s) => s !== "suggestion").map((s) => {
            const count = errors.filter((e) => e.severity === s).length;
            return count > 0 ? (
              <SeverityBadge key={s} severity={s}>
                {count}
              </SeverityBadge>
            ) : null;
          })}
        </div>
      )}

      {corrected !== message.content ? (
        <DiffText from={message.content} to={corrected} />
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      )}
      {message.inputMode === "spoken" && (
        <div className="-mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Mic className="size-3" />
          Spoken
          {message.fluency && <FluencyNote fluency={message.fluency} />}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {errors.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-red-600/90 line-through dark:text-red-400/90">{e.original}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{e.correction}</span>
                <span className="text-xs text-muted-foreground">· {categoryLabel(e.category)}</span>
              </div>
              <p className="text-muted-foreground">{e.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      {message.naturalText && showNative && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <MessageCircleHeart className="size-3.5" />
            How a native speaker would say it
          </div>
          <div className="flex items-start gap-1">
            <p className="flex-1 leading-relaxed whitespace-pre-wrap">{message.naturalText}</p>
            <SpeakButton text={message.naturalText} />
          </div>
        </div>
      )}

      <div className="-mb-1 flex flex-wrap gap-1 border-t pt-2">
        <SpeakButton text={corrected} label="Listen" />
        <CopyButton text={corrected} label="Copy corrected" onError={copyFailed} />
        {message.improvedPrompt && <CopyButton text={message.improvedPrompt} label="Copy prompt" onError={copyFailed} />}
        <CopyAndCloseButton text={corrected} onClose={onClose} onError={copyFailed} />
        {message.naturalText && (
          <Button
            variant={showNative ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowNative(!showNative)}
            aria-pressed={showNative}
            title="Show or hide how a native speaker would say it"
          >
            <MessageCircleHeart />
            Native
          </Button>
        )}
      </div>

      {reply && (
        <div className="flex gap-2 border-t pt-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bot className="size-3.5" />
          </div>
          <p className="flex-1 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
          <SpeakButton text={reply.content} id={reply.id} />
        </div>
      )}
    </div>
  );
}

const SHOW_NATIVE_KEY = "floating-show-native";
const showNativeListeners = new Set<() => void>();
/** Used when storage is blocked, so the button still works until the page reloads. */
let showNativeInMemory = false;

function readShowNative() {
  try {
    return localStorage.getItem(SHOW_NATIVE_KEY) === "on";
  } catch {
    return showNativeInMemory;
  }
}

/** Whether the floating window shows the native version, remembered in this browser. Hidden by default to save space. */
function useShowNative(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (listener) => {
      showNativeListeners.add(listener);
      return () => showNativeListeners.delete(listener);
    },
    readShowNative,
    () => false,
  );
  const set = (value: boolean) => {
    showNativeInMemory = value;
    try {
      localStorage.setItem(SHOW_NATIVE_KEY, value ? "on" : "off");
    } catch {
      // Storage blocked: remembered in memory only.
    }
    showNativeListeners.forEach((l) => l());
  };
  return [on, set];
}

/**
 * Closing the window right after the write loses it on Windows: the clipboard write is still in
 * flight when the window's document goes away. Show "Copied" for a moment, then close.
 */
function CopyAndCloseButton({ text, onClose, onError }: { text: string; onClose: () => void; onError: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyAndClose(event: React.MouseEvent<HTMLButtonElement>) {
    try {
      await copyText(text, event.currentTarget);
      setCopied(true);
      setTimeout(onClose, 600);
    } catch {
      onError();
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copyAndClose}
      disabled={copied}
      title="Copy the corrected text and close this window"
    >
      {copied ? <Check /> : <ClipboardCheck />}
      {copied ? "Copied" : "Copy & close"}
    </Button>
  );
}
