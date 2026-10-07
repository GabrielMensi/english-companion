"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copies with the clipboard of the window the element is in: the floating window has its own,
 * and writing from an unfocused window (the hidden tab) is rejected.
 */
export function copyText(text: string, from: Element) {
  return (from.ownerDocument.defaultView?.navigator ?? navigator).clipboard.writeText(text);
}

export function CopyButton({
  text,
  label,
  onError = () => toast.error("Couldn't copy to the clipboard"),
}: {
  text: string;
  /** Shown next to the icon; without it the button is just the icon. */
  label?: string;
  onError?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    try {
      await copyText(text, event.currentTarget);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onError();
    }
  }

  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-xs"}
      className={label ? undefined : "text-muted-foreground hover:text-foreground"}
      onClick={copy}
      aria-label={label ? undefined : copied ? "Copied" : `Copy: ${text}`}
      title={label ? undefined : copied ? "Copied" : "Copy"}
    >
      {copied ? <Check /> : <Copy />}
      {label && (copied ? "Copied" : label)}
    </Button>
  );
}
