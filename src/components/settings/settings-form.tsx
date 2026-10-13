"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/provider-info";
import { api } from "@/lib/api";
import { NEW_CARD_LIMIT_OPTIONS } from "@/lib/flashcards-upkeep-core";
import type { Settings } from "@/lib/settings";
import { ModelChain } from "./model-chain";
import { ProviderCard, type Providers, type TestState } from "./provider-card";

type TestResponse = { ok: true; reply: string; ms: number } | { ok: false; error: string };

/** Every change is saved as soon as it's made (text fields when they lose focus). */
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
  const [tests, setTests] = useState<Partial<Record<ProviderId, TestState>>>({});
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  // Saves run one after another, so they reach the server in the order they were made.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function clearTests(ids: ProviderId[]) {
    setTests((t) => Object.fromEntries(Object.entries(t).filter(([id]) => !ids.includes(id as ProviderId))));
  }

  function save(patch: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...patch }));
    if (patch.models) clearTests(PROVIDER_IDS.filter((id) => patch.models?.[id] !== settings.models[id]));

    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const result = await api<{ providers: Providers }>("/api/settings", { method: "PATCH", body: patch });
        setProviders(result.providers);
        setFailed(false);
        router.refresh();
      } catch (error) {
        toast.error(`Couldn't save: ${(error as Error).message}`);
        setFailed(true);
        // Show what's actually saved instead of the change that failed.
        const saved = await api<{ settings: Settings }>("/api/settings").catch(() => null);
        if (saved) setSettings(saved.settings);
      } finally {
        setPending((n) => n - 1);
      }
    });
  }

  function runTest(id: ProviderId) {
    setTests((t) => ({ ...t, [id]: { status: "testing" } }));
    // Test what's saved, including changes still on their way.
    queue.current.then(async () => {
      const result = await api<TestResponse>("/api/settings/test", { body: { provider: id } }).catch(
        (error: Error): TestResponse => ({ ok: false, error: error.message }),
      );
      setTests((t) => ({
        ...t,
        [id]: result.ok ? { status: "ok", ms: result.ms } : { status: "error", error: result.error },
      }));
    });
  }

  function onProvidersChange(next: Providers) {
    setProviders(next);
    clearTests(PROVIDER_IDS.filter((id) => next[id].detail !== providers[id].detail));
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <SaveStatus pending={pending > 0} failed={failed} />

      <ModelChain
        settings={settings}
        providers={providers}
        tests={tests}
        onChange={(chain) => save(chain)}
        onTestAll={(ids) => ids.forEach(runTest)}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-section font-semibold tracking-tight">Providers</h2>
          <p className="text-sm text-muted-foreground">
            Set up each provider’s key and model. Changing them here doesn’t change the order above.
          </p>
        </div>
        {PROVIDER_IDS.map((id) => (
          <ProviderCard
            key={id}
            id={id}
            settings={settings}
            status={providers[id]}
            test={tests[id]}
            onSave={save}
            onProvidersChange={onProvidersChange}
            onTest={() => runTest(id)}
          />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-section font-semibold tracking-tight">Corrections</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Explanation language</Label>
            <p className="text-sm text-muted-foreground">English is more immersive; Spanish is clearer.</p>
          </div>
          <Select
            value={settings.explanationLanguage}
            onValueChange={(v) => save({ explanationLanguage: v as Settings["explanationLanguage"] })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="typos">Count typos in stats</Label>
            <p className="text-sm text-muted-foreground">
              Typos are always highlighted in corrections, but they don’t reflect a lack of knowledge.
            </p>
          </div>
          <Switch
            id="typos"
            checked={settings.countTyposInStats}
            onCheckedChange={(v) => save({ countTyposInStats: v })}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-section font-semibold tracking-tight">Flashcards</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>New cards per session</Label>
            <p className="text-sm text-muted-foreground">
              Never-seen cards added after the ones due. Fewer keeps the daily reviews light.
            </p>
          </div>
          <Select
            value={String(settings.newCardsPerSession)}
            onValueChange={(v) => save({ newCardsPerSession: Number(v) })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...NEW_CARD_LIMIT_OPTIONS, settings.newCardsPerSession])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 0 ? "None" : n}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}

function SaveStatus({ pending, failed }: { pending: boolean; failed: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Saving…
        </>
      ) : failed ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <XCircle className="size-4" /> The last change wasn’t saved
        </span>
      ) : (
        <>
          <CheckCircle2 className="size-4" /> Changes are saved automatically
        </>
      )}
    </p>
  );
}
