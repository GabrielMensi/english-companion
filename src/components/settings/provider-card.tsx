"use client";

import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODEL_INFO, PROVIDERS, type ProviderId } from "@/lib/ai/provider-info";
import type { ProviderStatus } from "@/lib/ai/providers";
import { api } from "@/lib/api";
import { KEY_ENV_VARS, type KeyProvider } from "@/lib/credentials";
import type { Settings } from "@/lib/settings";

export type Providers = Record<ProviderId, ProviderStatus>;
export type TestState = { status: "testing" } | { status: "ok"; ms: number } | { status: "error"; error: string };

/** Everything about one provider: credentials, model, a connection test and its status. */
export function ProviderCard({
  id,
  settings,
  status,
  test,
  onSave,
  onProvidersChange,
  onTest,
}: {
  id: ProviderId;
  settings: Settings;
  status: ProviderStatus;
  test: TestState | undefined;
  onSave: (patch: Partial<Settings>) => void;
  onProvidersChange: (providers: Providers) => void;
  onTest: () => void;
}) {
  const info = PROVIDERS[id];
  // Bumped when the key changes, so the model list is fetched again.
  const [credentialsVersion, setCredentialsVersion] = useState(0);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{info.label}</h3>
          <p className="text-sm text-muted-foreground">{info.description}</p>
        </div>
        {status.configured ? (
          <Badge variant="secondary">API key set</Badge>
        ) : (
          <Badge variant="outline">No API key</Badge>
        )}
      </div>

      <ApiKeyField
        provider={id}
        status={status}
        onChange={(next) => {
          onProvidersChange(next);
          setCredentialsVersion((v) => v + 1);
        }}
      />

      <ModelField
        id={id}
        model={settings.models[id]}
        credentialsVersion={credentialsVersion}
        disabled={!status.configured}
        onChange={(model) => onSave({ models: { ...settings.models, [id]: model } })}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={!status.configured || test?.status === "testing"}
        >
          {test?.status === "testing" ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Test
        </Button>
        <TestResult test={test} />
      </div>
    </section>
  );
}

export function TestResult({ test, compact = false }: { test: TestState | undefined; compact?: boolean }) {
  if (test?.status === "ok") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-mark-right">
        <CheckCircle2 className="size-4 shrink-0" /> {compact ? "" : "Working "}({(test.ms / 1000).toFixed(1)}s)
      </span>
    );
  }
  if (test?.status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-destructive" title={test.error}>
        <XCircle className="size-4 shrink-0" /> {compact ? "Failed" : test.error}
      </span>
    );
  }
  if (test?.status === "testing" && compact) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  return null;
}

/** "93 % in eval · ~2 s · ~500 requests/day free", or null for models without data. */
export function modelFacts(provider: ProviderId, model: string): string | null {
  const info = MODEL_INFO[model];
  const facts = [
    info?.score !== undefined && `${info.score} % in eval`,
    info?.seconds !== undefined && `~${info.seconds} s`,
    info?.freeLimit && `${info.freeLimit} free`,
  ].filter(Boolean);
  return facts.length > 0 ? facts.join(" · ") : null;
}

function ModelField({
  id,
  model,
  credentialsVersion,
  disabled,
  onChange,
}: {
  id: ProviderId;
  model: string;
  /** Bumped when the key changes, so the list is fetched again. */
  credentialsVersion: number;
  disabled: boolean;
  onChange: (model: string) => void;
}) {
  const [models, setModels] = useState<{ key: number; list: string[]; error?: string } | null>(null);
  const [draft, setDraft] = useState(model);
  const inputId = `model-${id}`;
  const loaded = models?.key === credentialsVersion ? models : null;

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    fetch(`/api/models?${new URLSearchParams({ provider: id })}`)
      .then((res) => res.json())
      .then((data: { models: string[]; error?: string }) => {
        if (!cancelled) setModels({ key: credentialsVersion, list: data.models, error: data.error });
      })
      .catch(
        () => !cancelled && setModels({ key: credentialsVersion, list: [], error: "Couldn't get the model list" }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, credentialsVersion, disabled]);

  function commit() {
    const value = draft.trim();
    if (value && value !== model) onChange(value);
    else setDraft(model);
  }

  const info = MODEL_INFO[model];
  const facts = modelFacts(id, model);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Model</Label>
      {loaded && loaded.list.length > 0 ? (
        <Select
          value={model}
          onValueChange={(value) => {
            setDraft(value);
            onChange(value);
          }}
        >
          <SelectTrigger id={inputId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!loaded.list.includes(model) && <SelectItem value={model}>{model} (not found)</SelectItem>}
            {loaded.list.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
                {MODEL_INFO[m]?.score !== undefined && (
                  <span className="text-muted-foreground"> · {MODEL_INFO[m].score} %</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={inputId}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
      )}
      {!disabled && !loaded && <p className="text-sm text-muted-foreground">Looking for available models…</p>}
      {loaded?.error && (
        <p className="text-sm text-muted-foreground">{loaded.error}. You can type the name manually.</p>
      )}
      <p className="text-sm text-muted-foreground">
        {[facts ?? "Not measured with pnpm eval:models yet", info?.note].filter(Boolean).join(". ")}
      </p>
    </div>
  );
}

const KEY_URLS: Record<KeyProvider, string> = {
  gemini: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
};

function ApiKeyField({
  provider,
  status,
  onChange,
}: {
  provider: KeyProvider;
  status: ProviderStatus;
  onChange: (providers: Providers) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = `api-key-${provider}`;

  async function save(apiKey: string | null) {
    setSaving(true);
    try {
      const result = await api<{ providers: Providers }>("/api/settings/keys", {
        method: "PUT",
        body: { provider, apiKey },
      });
      setValue("");
      onChange(result.providers);
      toast.success(apiKey ? "API key saved" : "API key removed");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>API key</Label>

      {status.source === "app" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <span>
            Saved in the app: <code>{status.detail}</code>
          </span>
          <Button variant="ghost" size="sm" onClick={() => void save(null)} disabled={saving}>
            Remove
          </Button>
        </div>
      )}
      {status.source === "env" && (
        <p className="text-sm text-muted-foreground">
          Using <code>{KEY_ENV_VARS[provider]}</code> from the environment (<code>{status.detail}</code>). A key saved
          here takes priority.
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // save() shows its own errors in a toast.
          if (value.trim()) void save(value);
        }}
      >
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.source === "app" ? "Paste a new key to replace it" : "Paste your API key"}
        />
        <Button type="submit" variant="outline" disabled={saving || !value.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          Save key
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        It’s only stored in your local database and never shown in full.{" "}
        {!status.configured && (
          <a href={KEY_URLS[provider]} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Get a free key
          </a>
        )}
      </p>
    </div>
  );
}
