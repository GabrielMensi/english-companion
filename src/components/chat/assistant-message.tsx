import { Bot } from "lucide-react";
import { ModelNote } from "@/components/chat/model-note";
import type { ChatMessage } from "@/lib/types";

export function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-4" />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        <ModelNote verb="Replied by" provider={message.provider} model={message.model} durationMs={message.durationMs} />
      </div>
    </div>
  );
}
