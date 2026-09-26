"use client";

import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({ onSend, disabled }: { onSend: (text: string) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState("");

  async function submit() {
    const value = text.trim();
    if (!value || disabled) return;
    setText("");
    // Give the text back if sending failed, so nothing is lost.
    if (!(await onSend(value))) setText(value);
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Write in English… (Enter para enviar, Shift+Enter para salto de línea)"
        // The browser's spellchecker would give away the mistakes before the tutor sees them.
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoFocus
        rows={3}
        className="max-h-60 min-h-20 resize-none"
      />
      <Button onClick={submit} disabled={disabled || !text.trim()} size="icon-lg" aria-label="Enviar">
        <SendHorizontal />
      </Button>
    </div>
  );
}
