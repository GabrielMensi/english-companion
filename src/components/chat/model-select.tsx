"use client";

import { Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { modelLabel, type ProviderId } from "@/lib/ai/provider-info";
import { api } from "@/lib/api";

export interface ModelOption {
  provider: ProviderId;
  model: string;
}

/** Switches the selected model (a global setting) from the chat header. */
export function ModelSelect({ options, selected }: { options: ModelOption[]; selected: ProviderId }) {
  const router = useRouter();
  const [value, setValue] = useState(selected);

  async function change(provider: ProviderId) {
    const previous = value;
    setValue(provider);
    try {
      await api("/api/settings", { method: "PATCH", body: { provider } });
      router.refresh();
    } catch (error) {
      setValue(previous);
      toast.error((error as Error).message);
    }
  }

  return (
    <Select value={value} onValueChange={(v) => change(v as ProviderId)}>
      <SelectTrigger size="sm" className="max-w-72" aria-label="Model">
        <Cpu className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.provider} value={o.provider}>
            {modelLabel(o.provider, o.model)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
