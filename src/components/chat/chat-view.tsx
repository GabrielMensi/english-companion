"use client";

import { PictureInPicture2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { Composer, type Notify, useComposer } from "@/components/chat/composer";
import { MiniChat, type Notice } from "@/components/chat/mini-chat";
import { type ModelOption, ModelSelect } from "@/components/chat/model-select";
import { UserMessage } from "@/components/chat/user-message";
import { usePipWindow } from "@/components/pip/use-pip-window";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SessionMode } from "@/db/schema";
import type { ProviderId } from "@/lib/ai/provider-info";
import { api } from "@/lib/api";
import type { ChatMessage, SessionSummary, VoiceInput } from "@/lib/types";

export function ChatView({
  session,
  initialMessages,
  models,
  selectedProvider,
  canDictate,
}: {
  session: SessionSummary;
  initialMessages: ChatMessage[];
  models: ModelOption[];
  selectedProvider: ProviderId;
  canDictate: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [mode, setMode] = useState(session.mode);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pip = usePipWindow();
  // Tied to the window it was shown in, so it doesn't come back when the window is reopened.
  const [notice, setNotice] = useState<(Notice & { window: Window }) | null>(null);

  /** Toasts render in the tab, which is hidden while the floating window is open: show them there instead. */
  const notify: Notify = (kind, message) => {
    const floating = window.documentPictureInPicture?.window;
    if (floating) setNotice({ kind, message, window: floating });
    else toast[kind](message);
  };

  const composer = useComposer({ onSend: send, disabled: sending, notify });
  const lastSent = messages.findLast((m) => m.role === "user");
  const reply = lastSent && messages.find((m) => m.replyToId === lastSent.id);

  // Info notices go away on their own; errors stay until dismissed or replaced.
  useEffect(() => {
    if (notice?.kind !== "info") return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Alt+P pops the composer out into a floating window, or brings it back.
  const { window: pipWindow, open: openPip, close: closePip } = pip;
  useEffect(() => {
    if (!pip.supported) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "KeyP" || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      if (pipWindow) closePip();
      else void openPip().catch((error: Error) => toast.error(`Couldn't open the floating window: ${error.message}`));
    }
    // Keys pressed in the floating window don't reach the tab's listeners.
    const targets = [window, ...(pipWindow ? [pipWindow] : [])];
    targets.forEach((t) => t.addEventListener("keydown", onKeyDown));
    return () => targets.forEach((t) => t.removeEventListener("keydown", onKeyDown));
  }, [pip.supported, pipWindow, openPip, closePip]);

  // Switching tabs while dictating pops the window out on its own (like Google Meet), so you can keep
  // talking while looking at something else. Chrome only allows it while the page uses the microphone.
  useEffect(() => {
    if (!pip.supported || !composer.recording || pipWindow) return;
    const action = "enterpictureinpicture" as MediaSessionAction;
    try {
      navigator.mediaSession.setActionHandler(action, () => void openPip({ auto: true }).catch(() => {}));
    } catch {
      return; // This browser doesn't support automatic picture-in-picture.
    }
    return () => navigator.mediaSession.setActionHandler(action, null);
  }, [pip.supported, composer.recording, pipWindow, openPip]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  /** Replaces the turn's messages (by id) or appends them. */
  function mergeTurn(turn: ChatMessage[], replaceId?: string) {
    setMessages((prev) => {
      const ids = new Set(turn.map((m) => m.id));
      const kept = prev.filter(
        (m) => m.id !== replaceId && !ids.has(m.id) && m.replyToId !== turn[0].id,
      );
      return [...kept, ...turn].sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  async function send(text: string, voice?: VoiceInput) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, optimisticMessage(tempId, session.id, text, voice)]);
    setSending(true);
    try {
      const turn = await api<ChatMessage[]>(`/api/sessions/${session.id}/messages`, { body: { text, voice } });
      mergeTurn(turn, tempId);
      if (messages.length === 0) router.refresh(); // first message sets the chat title
      return true;
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      notify("error", (error as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function retry(messageId: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "pending" } : m)));
    try {
      mergeTurn(await api<ChatMessage[]>(`/api/messages/${messageId}/retry`, { method: "POST" }));
    } catch (error) {
      notify("error", (error as Error).message);
    }
  }

  function updateMessage(updated: Partial<ChatMessage> & { id: string }) {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  }

  async function changeMode(value: SessionMode) {
    setMode(value);
    try {
      await api(`/api/sessions/${session.id}`, { method: "PATCH", body: { mode: value } });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-2.5">
        <h1 className="truncate font-medium">{session.title}</h1>
        <div className="flex items-center gap-3">
          {pip.supported && (
            <Button
              variant={pipWindow ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() =>
                pipWindow
                  ? closePip()
                  : openPip().catch((error: Error) => toast.error(`Couldn't open the floating window: ${error.message}`))
              }
              aria-label={pipWindow ? "Bring the composer back" : "Pop out"}
              title={
                pipWindow
                  ? "Bring the composer back to the tab (Alt+P)"
                  : "Pop out: a floating window to write or dictate while you work in other apps (Alt+P)"
              }
            >
              <PictureInPicture2 />
            </Button>
          )}
          <ModelSelect key={selectedProvider} options={models} selected={selectedProvider} />
          <Select value={mode} onValueChange={(v) => changeMode(v as SessionMode)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="correction">Correction</SelectItem>
              <SelectItem value="conversation">Conversation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
          {messages.length === 0 && (
            <p className="py-16 text-center text-muted-foreground">
              {mode === "conversation"
                ? "Write about anything you like: I'll correct you and keep the conversation going."
                : "Write something in English and I'll give it back corrected."}
            </p>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <UserMessage key={m.id} message={m} onRetry={retry} onUpdate={updateMessage} />
            ) : (
              <AssistantMessage key={m.id} message={m} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-4">
          {pipWindow ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <PictureInPicture2 className="size-4" />
                Popped out: write in the floating window.
              </span>
              <Button variant="outline" size="sm" onClick={closePip}>
                Back in the tab
              </Button>
            </div>
          ) : (
            <Composer composer={composer} canDictate={canDictate} />
          )}
        </div>
      </div>

      {pipWindow &&
        createPortal(
          <MiniChat
            title={session.title}
            mode={mode}
            message={lastSent}
            reply={reply}
            composer={composer}
            canDictate={canDictate}
            notice={notice?.window === pipWindow ? notice : null}
            onDismissNotice={() => setNotice(null)}
            notify={notify}
            onRetry={retry}
            onClose={closePip}
          />,
          pipWindow.document.body,
        )}
    </div>
  );
}

function optimisticMessage(id: string, sessionId: string, text: string, voice?: VoiceInput): ChatMessage {
  return {
    id,
    sessionId,
    role: "user",
    replyToId: null,
    content: text,
    status: "pending",
    errorMessage: null,
    correctedText: null,
    naturalText: null,
    improvedPrompt: null,
    improvedPromptProvider: null,
    improvedPromptModel: null,
    improvedPromptDurationMs: null,
    wordCount: 0,
    provider: null,
    model: null,
    fallbackAttempts: null,
    durationMs: null,
    inputMode: voice ? "spoken" : "typed",
    transcriptRaw: voice?.transcriptRaw ?? null,
    transcriptEdited: voice?.transcriptEdited ?? null,
    transcriptionProvider: voice?.transcriptionProvider ?? null,
    transcriptionModel: voice?.transcriptionModel ?? null,
    audioDurationMs: voice?.audioDurationMs ?? null,
    createdAt: Date.now(),
    corrections: [],
    vocabulary: [],
  };
}
