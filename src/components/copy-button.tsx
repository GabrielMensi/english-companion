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
  label = "Copy",
  onError = () => toast.error("Couldn't copy to the clipboard"),
}: {
  text: string;
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
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
