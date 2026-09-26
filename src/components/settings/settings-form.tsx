"use client";

import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/lib/ai/provider-info";
import { api } from "@/lib/api";
import type { ProviderStatus } from "@/lib/ai/providers";
import { DEFAULT_OLLAMA_BASE_URL, KEY_ENV_VARS, type KeyProvider } from "@/lib/credentials";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Providers = Record<ProviderId, ProviderStatus>;
type TestResult = { ok: true; reply: string; ms: number } | { ok: false; error: string };

export function SettingsForm({
  initialSettings,
  initialProviders,
}: {
  initialSettings: Settings;
  initialProviders: Providers;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [providers, setProviders] = useState(initialProviders);
  // Bumped when credentials change, so the model list is fetched again.
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  // The Ollama URL used to list models; updated when the URL field loses focus.
  const [listedOllamaUrl, setListedOllamaUrl] = useState(initialSettings.ollamaBaseUrl ?? "");
  const [models, setModels] = useState<{ list: string[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const provider = settings.provider;
  const status = providers[provider];

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ provider });
    if (provider === "ollama" && listedOllamaUrl) query.set("ollamaBaseUrl", listedOllamaUrl);
    fetch(`/api/models?${query}`)
      .then((res) => res.json())
      .then((data: { models: string[]; error?: string }) => {
        if (!cancelled) setModels({ list: data.models, error: data.error });
      })
      .catch(() => !cancelled && setModels({ list: [], error: "No se pudo obtener la lista de modelos" }));
    return () => {
      cancelled = true;
    };
  }, [provider, credentialsVersion, listedOllamaUrl]);

  function update(patch: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setTest(null);
  }

  function setProvider(value: ProviderId) {
    setModels(null);
    update({ provider: value });
  }

  function setModel(value: string) {
    update({ models: { ...settings.models, [provider]: value } });
  }

  async function save() {
    setSaving(true);
    try {
      const result = await api<{ providers: Providers }>("/api/settings", { method: "PUT", body: settings });
      setProviders(result.providers);
      toast.success("Configuración guardada");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setTest(await res.json());
    setTesting(false);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-medium">Proveedor</h2>
        <div className="grid gap-2">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setProvider(id)}
              className={cn(
                "flex items-start justify-between gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                provider === id && "border-primary ring-1 ring-primary",
              )}
            >
              <div>
                <div className="font-medium">{PROVIDERS[id].label}</div>
                <div className="text-sm text-muted-foreground">{PROVIDERS[id].description}</div>
              </div>
              {PROVIDERS[id].local ? (
                <Badge variant="secondary">Local</Badge>
              ) : providers[id].configured ? (
                <Badge variant="secondary">API key OK</Badge>
              ) : (
                <Badge variant="outline">Sin API key</Badge>
              )}
            </button>
          ))}
        </div>
      </section>

      {provider === "ollama" ? (
        <section className="space-y-2">
          <Label htmlFor="ollama-url" className="font-medium">
            URL de Ollama
          </Label>
          <Input
            id="ollama-url"
            value={settings.ollamaBaseUrl ?? ""}
            placeholder={status.source === "env" && status.detail ? status.detail : DEFAULT_OLLAMA_BASE_URL}
            onChange={(e) => update({ ollamaBaseUrl: e.target.value.trim() || null })}
            onBlur={() => setListedOllamaUrl(settings.ollamaBaseUrl ?? "")}
          />
          <p className="text-sm text-muted-foreground">
            Dejalo vacío para usar {status.source === "env" ? <code>OLLAMA_BASE_URL</code> : "el default"}.
          </p>
        </section>
      ) : (
        <ApiKeyField
          provider={provider}
          status={status}
          onChange={(next) => {
            setProviders(next);
            setModels(null);
            setTest(null);
            setCredentialsVersion((v) => v + 1);
          }}
        />
      )}

      <section className="space-y-3">
        <Label htmlFor="model" className="font-medium">
          Modelo
        </Label>
        {models && models.list.length > 0 ? (
          <Select value={settings.models[provider]} onValueChange={setModel}>
            <SelectTrigger id="model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!models.list.includes(settings.models[provider]) && (
                <SelectItem value={settings.models[provider]}>{settings.models[provider]} (no encontrado)</SelectItem>
              )}
              {models.list.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id="model" value={settings.models[provider]} onChange={(e) => setModel(e.target.value)} />
        )}
        {models === null && <p className="text-sm text-muted-foreground">Buscando modelos disponibles…</p>}
        {models?.error && <p className="text-sm text-muted-foreground">{models.error}. Podés escribir el nombre a mano.</p>}

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
            Probar conexión
          </Button>
          {test?.ok === true && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Responde ({(test.ms / 1000).toFixed(1)}s)
            </span>
          )}
          {test?.ok === false && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" /> {test.error}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">Correcciones</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Idioma de las explicaciones</Label>
            <p className="text-sm text-muted-foreground">En inglés es más inmersivo; en español, más claro.</p>
          </div>
          <Select
            value={settings.explanationLanguage}
            onValueChange={(v) => update({ explanationLanguage: v as Settings["explanationLanguage"] })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="typos">Contar typos en las estadísticas</Label>
            <p className="text-sm text-muted-foreground">
              Los typos siempre se marcan en la corrección, pero no reflejan falta de conocimiento.
            </p>
          </div>
          <Switch
            id="typos"
            checked={settings.countTyposInStats}
            onCheckedChange={(v) => update({ countTyposInStats: v })}
          />
        </div>
      </section>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        Guardar
      </Button>
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

  async function save(apiKey: string | null) {
    setSaving(true);
    try {
      const result = await api<{ providers: Providers }>("/api/settings/keys", {
        method: "PUT",
        body: { provider, apiKey },
      });
      setValue("");
      onChange(result.providers);
      toast.success(apiKey ? "API key guardada" : "API key eliminada");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <Label htmlFor="api-key" className="font-medium">
        API key de {PROVIDERS[provider].label}
      </Label>

      {status.source === "app" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <span>
            Guardada en la app: <code>{status.detail}</code>
          </span>
          <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={saving}>
            Eliminar
          </Button>
        </div>
      )}
      {status.source === "env" && (
        <p className="text-sm text-muted-foreground">
          Usando <code>{KEY_ENV_VARS[provider]}</code> del entorno (<code>{status.detail}</code>). Si guardás una
          acá, tiene prioridad.
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) save(value);
        }}
      >
        <Input
          id="api-key"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.source === "app" ? "Pegá una nueva key para reemplazarla" : "Pegá tu API key"}
        />
        <Button type="submit" variant="outline" disabled={saving || !value.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          Guardar key
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Se guarda solo en tu base local y nunca se muestra completa.{" "}
        {!status.configured && (
          <a href={KEY_URLS[provider]} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Conseguir una key gratis
          </a>
        )}
      </p>
    </section>
  );
}
