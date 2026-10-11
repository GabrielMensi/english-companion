"use client";

import { ArrowDown, ArrowUp, Loader2, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { type Chain, chainSteps, moveStep, toggleStep } from "@/lib/ai/fallback";
import { PROVIDERS, type ProviderId } from "@/lib/ai/provider-info";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { modelFacts, type Providers, TestResult, type TestState } from "./provider-card";

/**
 * The full order in which models are tried: the primary, then each enabled
 * fallback. Steps can be moved (moving one to the top makes it the primary)
 * or turned off.
 */
export function ModelChain({
  settings,
  providers,
  tests,
  onChange,
  onTestAll,
}: {
  settings: Settings;
  providers: Providers;
  tests: Partial<Record<ProviderId, TestState>>;
  onChange: (chain: Chain) => void;
  onTestAll: (ids: ProviderId[]) => void;
}) {
  const steps = chainSteps(settings);
  const enabledCount = steps.filter((s) => s.enabled).length;
  const testable = steps.filter((s) => s.enabled && providers[s.provider].configured).map((s) => s.provider);
  const testing = testable.some((id) => tests[id]?.status === "testing");
  const primaryConfigured = providers[settings.provider].configured;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-section font-semibold tracking-tight">Model chain</h2>
          <p className="text-sm text-muted-foreground">
            Every message goes to the first model. If it fails (offline, quota exceeded, overloaded…), the next one
            takes over.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onTestAll(testable)} disabled={testing || !testable.length}>
          {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Test all
        </Button>
      </div>

      <ol className="grid gap-2">
        {steps.map(({ provider: id, enabled }, i) => {
          const configured = providers[id].configured;
          const isPrimary = i === 0;
          const facts = modelFacts(id, settings.models[id]);
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                isPrimary && "border-primary",
                (!enabled || !configured) && "bg-muted/40",
              )}
            >
              <span className="w-5 text-center text-sm text-muted-foreground tabular-nums">
                {enabled ? i + 1 : "–"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", !enabled && "text-muted-foreground")}>{PROVIDERS[id].name}</span>
                  <code className="truncate text-sm text-muted-foreground">{settings.models[id]}</code>
                  {isPrimary && <Badge>Primary</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {!configured ? "No API key: add one below to use it" : !enabled ? "Off" : (facts ?? "No eval data")}
                </div>
              </div>
              {enabled && <TestResult test={tests[id]} compact />}
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Move ${PROVIDERS[id].name} up`}
                  disabled={!enabled || isPrimary}
                  onClick={() => onChange(moveStep(settings, id, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Move ${PROVIDERS[id].name} down`}
                  disabled={!enabled || i === enabledCount - 1}
                  onClick={() => onChange(moveStep(settings, id, 1))}
                >
                  <ArrowDown />
                </Button>
              </div>
              <Switch
                aria-label={`Use ${PROVIDERS[id].name}`}
                checked={enabled}
                // The primary can't be turned off: move another model to the top instead.
                disabled={isPrimary}
                onCheckedChange={(on) => onChange(toggleStep(settings, id, on))}
              />
            </li>
          );
        })}
      </ol>
      {!primaryConfigured && (
        <p className="text-sm text-destructive">
          {PROVIDERS[settings.provider].name} is first but has no API key. Add one below or move another model to the
          top.
        </p>
      )}
    </section>
  );
}
