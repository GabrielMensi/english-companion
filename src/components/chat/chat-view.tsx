"use client";

import { Headphones, KeyRound, PictureInPicture2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { preloadSpeech, speak, stopSpeaking, useSpeechSupported, useVoiceMode } from "@/components/audio/speech";
import { PUSH_TO_TALK_KEYS } from "@/components/audio/use-push-to-talk";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { ChatMenu, type ModelOption, ModeSwitch } from "@/components/chat/chat-controls";
import { Composer, type Notify, useComposer } from "@/components/chat/composer";
import { MiniChat, type Notice } from "@/components/chat/mini-chat";
import { UserMessage } from "@/components/chat/user-message";
import { usePipWindow } from "@/components/pip/use-pip-window";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { SessionMode } from "@/db/schema";
import type { AnalysisPreview } from "@/lib/ai/analysis";
import { NO_PROVIDER_MESSAGE } from "@/lib/ai/fallback";
import type { ProviderId } from "@/lib/ai/provider-info";
import { api, streamTurn } from "@/lib/api";
import type { ChatMessage, SessionSummary, VoiceInput } from "@/lib/types";

export function ChatView({
  session,
  initialMessages,
  models,
  selectedProvider,
  hasModel,
  canDictate,
  answerTemplate = null,
}: {
  session: Omit<SessionSummary, "practice">;
  initialMessages: ChatMessage[];
  models: ModelOption[];
  selectedProvider: ProviderId;
  /** False when no provider has an API key: nothing can be corrected until one is added. */
  hasModel: boolean;
  canDictate: boolean;
  /** In an exercise chat waiting for the answers to its set: numbered lines to fill in. */
  answerTemplate?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [mode, setMode] = useState(session.mode);
  const [sending, setSending] = useState(false);
  /** Analyses being streamed, by message id. */
  const [previews, setPreviews] = useState<Record<string, AnalysisPreview>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const pip = usePipWindow();
  const [voiceMode, setVoiceMode] = useVoiceMode();
  const speechSupported = useSpeechSupported();
  // Talking by voice only makes sense when the tutor answers.
  const voiceConversation = voiceMode && mode === "conversation" && canDictate && speechSupported;
  // Tied to the window it was shown in, so it doesn't come back when the window is reopened.
  const [notice, setNotice] = useState<(Notice & { window: Window }) | null>(null);

  /** Toasts render in the tab, which is hidden while the floating window is open: show them there instead. */
  const notify: Notify = (kind, message) => {
    const floating = window.documentPictureInPicture?.window;
    if (floating) setNotice({ kind, message, window: floating });
    else toast[kind](message);
  };

  const composer = useComposer({
    onSend: send,
    disabled: sending,
    notify,
    canDictate,
    autoSend: voiceConversation,
    keyWindow: pip.window,
    initialText: answerTemplate ?? "",
    // Until the set is answered, the answers go on several lines.
    multiline: answerTemplate !== null && !messages.some((m) => m.role === "user"),
  });
  const lastSent = messages.findLast((m) => m.role === "user");
  const reply = lastSent && messages.find((m) => m.replyToId === lastSent.id);

  // With Kokoro, voice mode loads the model right away so the first reply isn't kept waiting.
  useEffect(() => {
    if (voiceConversation) preloadSpeech();
  }, [voiceConversation]);

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

  // Also follow the streamed correction as it grows, but only on coarse changes to avoid jitter.
  const previewShape = Object.values(previews)
    .map((p) => `${p.correctedDone}:${p.errors.length}:${!!p.naturalText}:${!!p.reply}`)
    .join();
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages.length, sending, previewShape]);

  function setPreview(id: string, preview: AnalysisPreview | null) {
    setPreviews((prev) => {
      const next = { ...prev };
      if (preview) next[id] = preview;
      else delete next[id];
      return next;
    });
  }

  /**
   * Posts to a route that analyzes a message, showing the correction while it's generated.
   * `target.id` is the message being analyzed; the optimistic one is swapped for the stored one
   * as soon as the server sends it, and `target.id` follows.
   */
  async function analyze(url: string, body: unknown, target: { id: string }) {
    try {
      return await streamTurn(url, body, (event) => {
        if (event.type === "message") {
          const { id } = target;
          setMessages((prev) => prev.map((m) => (m.id === id ? event.message : m)));
          target.id = event.message.id;
        } else {
          setPreview(target.id, event.preview);
        }
      });
    } finally {
      setPreview(target.id, null);
    }
  }

  /** Shows an error on a message whose analysis didn't come back, so it can be retried. */
  function markFailed(id: string, errorMessage: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "error", errorMessage } : m)));
  }

  /** Replaces the turn's messages (by id) or appends them. */
  function mergeTurn(turn: ChatMessage[], replaceId?: string) {
    setMessages((prev) => {
      const ids = new Set(turn.map((m) => m.id));
      const kept = prev.filter((m) => m.id !== replaceId && !ids.has(m.id) && m.replyToId !== turn[0].id);
      return [...kept, ...turn].sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  async function send(text: string, voice?: VoiceInput) {
    const tempId = `temp-${crypto.randomUUID()}`;
    setMessages((prev) => [...prev, optimisticMessage(tempId, session.id, text, voice)]);
    setSending(true);
    const target = { id: tempId };
    try {
      const turn = await analyze(`/api/sessions/${session.id}/messages`, { text, voice }, target);
      mergeTurn(turn, tempId);
      readReplyAloud(turn);
      if (messages.length === 0) router.refresh(); // first message sets the chat title
      return true;
    } catch (error) {
      // Once stored, the message stays (with the error and a retry button), as after a reload.
      if (target.id === tempId) setMessages((prev) => prev.filter((m) => m.id !== tempId));
      else markFailed(target.id, (error as Error).message);
      notify("error", (error as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function retry(messageId: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "pending" } : m)));
    try {
      const turn = await analyze(`/api/messages/${messageId}/retry`, undefined, { id: messageId });
      mergeTurn(turn);
      readReplyAloud(turn);
    } catch (error) {
      markFailed(messageId, (error as Error).message);
      notify("error", (error as Error).message);
    }
  }

  /** In voice mode the reply is read aloud; the corrections just show up in the chat. */
  function readReplyAloud(turn: ChatMessage[]) {
    const reply = turn.find((m) => m.role === "assistant");
    if (voiceConversation && reply) speak(reply.content, reply.id);
  }

  function toggleVoiceMode() {
    if (voiceMode) stopSpeaking();
    setVoiceMode(!voiceMode);
  }

  function togglePip() {
    if (pipWindow) closePip();
    else openPip().catch((error: Error) => toast.error(`Couldn't open the floating window: ${error.message}`));
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
    <div data-area="write" className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-medium">{session.title}</h1>
          {session.topic && (
            <StatusBadge tone="neutral" className="shrink-0">
              Topic
            </StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode === "conversation" && speechSupported && (
            <Button
              variant={voiceConversation ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleVoiceMode}
              disabled={!canDictate}
              aria-pressed={voiceConversation}
              title={
                canDictate
                  ? `Voice mode: replies are read aloud, hold ${PUSH_TO_TALK_KEYS} to answer`
                  : "Voice mode needs a Groq API key for dictation: add it in Settings"
              }
            >
              <Headphones />
              Voice
            </Button>
          )}
          <ModeSwitch value={mode} onChange={changeMode} />
          <ChatMenu
            key={selectedProvider}
            models={models}
            selected={selectedProvider}
            pip={pip.supported ? { open: Boolean(pipWindow), toggle: togglePip } : null}
          />
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
              <UserMessage key={m.id} message={m} preview={previews[m.id]} onRetry={retry} onUpdate={updateMessage} />
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
            <>
              {!hasModel && (
                <p className="mb-3 flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  <KeyRound className="size-4 shrink-0" />
                  <span>
                    {NO_PROVIDER_MESSAGE}{" "}
                    <Link href="/settings" className="underline underline-offset-4">
                      Open Settings
                    </Link>
                  </span>
                </p>
              )}
              <Composer composer={composer} canDictate={canDictate} />
              {voiceConversation && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Voice mode: hold <kbd className="rounded border px-1 font-sans">{PUSH_TO_TALK_KEYS}</kbd> to talk and
                  release to send (or tap it to start and stop). Replies are read aloud; corrections stay in the chat.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {pipWindow &&
        createPortal(
          <MiniChat
            title={session.title}
            mode={mode}
            message={lastSent}
            preview={lastSent && previews[lastSent.id]}
            reply={reply}
            composer={composer}
            canDictate={canDictate}
            notice={notice?.window === pipWindow ? notice : null}
            onDismissNotice={() => setNotice(null)}
            notify={notify}
            onRetry={retry}
            onClose={closePip}
            voice={
              mode === "conversation" && speechSupported
                ? { on: voiceConversation, canTurnOn: canDictate, toggle: toggleVoiceMode }
                : null
            }
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
    fluency: voice?.fluency ?? null,
    createdAt: Date.now(),
    corrections: [],
    vocabulary: [],
  };
}
