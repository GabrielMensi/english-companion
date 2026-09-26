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
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type ProviderStatus = Record<ProviderId, { configured: boolean; detail: string }>;
type TestResult = { ok: true; reply: string; ms: number } | { ok: false; error: string };

export function SettingsForm({
  initialSettings,
  providers,
}: {
  initialSettings: Settings;
  providers: ProviderStatus;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [models, setModels] = useState<{ list: string[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const provider = settings.provider;
  const status = providers[provider];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/models?provider=${provider}`)
      .then((res) => res.json())
      .then((data: { models: string[]; error?: string }) => {
        if (!cancelled) setModels({ list: data.models, error: data.error });
      })
      .catch(() => !cancelled && setModels({ list: [], error: "No se pudo obtener la lista de modelos" }));
    return () => {
      cancelled = true;
    };
  }, [provider]);

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
      await api("/api/settings", { method: "PUT", body: settings });
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
        {!status.configured && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Agregá <code>{status.detail}</code> en <code>.env.local</code> y reiniciá el servidor.
          </p>
        )}
        {provider === "ollama" && (
          <p className="text-sm text-muted-foreground">
            Conectando a <code>{status.detail}</code> (se cambia con <code>OLLAMA_BASE_URL</code>).
          </p>
        )}
      </section>

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
