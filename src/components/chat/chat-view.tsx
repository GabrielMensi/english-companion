"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { Composer } from "@/components/chat/composer";
import { UserMessage } from "@/components/chat/user-message";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SessionMode } from "@/db/schema";
import { api } from "@/lib/api";
import type { ChatMessage, SessionSummary } from "@/lib/types";

export function ChatView({
  session,
  initialMessages,
  modelLabel,
}: {
  session: SessionSummary;
  initialMessages: ChatMessage[];
  modelLabel: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [mode, setMode] = useState(session.mode);
  const [sending, setSending] = useState(false);
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

  async function send(text: string) {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, optimisticMessage(tempId, session.id, text)]);
    setSending(true);
    try {
      const turn = await api<ChatMessage[]>(`/api/sessions/${session.id}/messages`, { body: { text } });
      mergeTurn(turn, tempId);
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
      mergeTurn(await api<ChatMessage[]>(`/api/messages/${messageId}/retry`, { method: "POST" }));
    } catch (error) {
      toast.error((error as Error).message);
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
          <span className="hidden text-xs text-muted-foreground md:inline">{modelLabel}</span>
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
          <Composer onSend={send} disabled={sending} />
        </div>
      </div>
    </div>
  );
}

function optimisticMessage(id: string, sessionId: string, text: string): ChatMessage {
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
    wordCount: 0,
    provider: null,
    model: null,
    createdAt: Date.now(),
    corrections: [],
    vocabulary: [],
  };
}
