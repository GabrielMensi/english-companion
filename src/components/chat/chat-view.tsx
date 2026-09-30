"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Headphones } from "lucide-react";
import { speak, stopSpeaking, useSpeechSupported, useVoiceMode } from "@/components/audio/speech";
import { PUSH_TO_TALK_KEYS } from "@/components/audio/use-push-to-talk";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { Composer } from "@/components/chat/composer";
import { type ModelOption, ModelSelect } from "@/components/chat/model-select";
import { UserMessage } from "@/components/chat/user-message";
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
  const [voiceMode, setVoiceMode] = useVoiceMode();
  const speechSupported = useSpeechSupported();
  // Talking by voice only makes sense when the tutor answers.
  const voiceConversation = voiceMode && mode === "conversation" && canDictate && speechSupported;
  const bottomRef = useRef<HTMLDivElement>(null);

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
    const tempId = `temp-${crypto.randomUUID()}`;
    setMessages((prev) => [...prev, optimisticMessage(tempId, session.id, text, voice)]);
    setSending(true);
    try {
      const turn = await api<ChatMessage[]>(`/api/sessions/${session.id}/messages`, { body: { text, voice } });
      mergeTurn(turn, tempId);
      readReplyAloud(turn);
      if (messages.length === 0) router.refresh(); // first message sets the chat title
      return true;
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error((error as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function retry(messageId: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "pending" } : m)));
    try {
      const turn = await api<ChatMessage[]>(`/api/messages/${messageId}/retry`, { method: "POST" });
      mergeTurn(turn);
      readReplyAloud(turn);
    } catch (error) {
      toast.error((error as Error).message);
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
          <Composer onSend={send} disabled={sending} canDictate={canDictate} autoSend={voiceConversation} />
          {voiceConversation && (
            <p className="mt-2 text-xs text-muted-foreground">
              Voice mode: hold <kbd className="rounded border px-1 font-sans">{PUSH_TO_TALK_KEYS}</kbd> to talk and
              release to send (or tap it to start and stop). Replies are read aloud; corrections stay in the chat.
            </p>
          )}
        </div>
      </div>
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

