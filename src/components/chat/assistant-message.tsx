import { Bot } from "lucide-react";
import type { ChatMessage } from "@/lib/types";

export function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-4" />
      </div>
      <p className="pt-1 leading-relaxed whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}
