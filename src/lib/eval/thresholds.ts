/**
 * Pure logic for the evals' regression check (`pnpm eval:* --check`): compares the numbers an eval
 * measured against the thresholds checked in at `scripts/eval/thresholds.json`.
 */

/** A bound per metric: `min` for scores that must not drop, `max` for counts and errors that must not grow. */
export interface Bound {
  min?: number;
  max?: number;
}

export type Thresholds = Record<string, Bound>;

export interface EvalThresholds {
  /** Applies to every run of the eval. */
  default: Thresholds;
  /** Replaces `default` bounds for a specific run (the `provider:model` or engine spec). */
  overrides?: Record<string, Thresholds>;
}

export type ThresholdsFile = Record<string, EvalThresholds>;

export interface MetricCheck {
  metric: string;
  value: number;
  bound: string;
  pass: boolean;
}

/** Checks each metric that has a bound; a bounded metric that wasn't measured fails (nothing to compare). */
export function checkThresholds(
  metrics: Record<string, number | null | undefined>,
  config: EvalThresholds,
  spec?: string,
): MetricCheck[] {
  const bounds = { ...config.default, ...(spec ? config.overrides?.[spec] : undefined) };
  return Object.entries(bounds).map(([metric, { min, max }]) => {
    const value = metrics[metric];
    const bound = [min !== undefined && `>= ${min}`, max !== undefined && `<= ${max}`].filter(Boolean).join(" and ");
    const pass =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (min === undefined || value >= min) &&
      (max === undefined || value <= max);
    return { metric, value: value ?? Number.NaN, bound, pass };
  });
}

/** One line per run for the console: PASS/FAIL, then every metric that missed its bound. */
export function formatChecks(spec: string, checks: readonly MetricCheck[]): string {
  const failed = checks.filter((c) => !c.pass);
  if (failed.length === 0) return `PASS  ${spec}`;
  return `FAIL  ${spec}\n${failed.map((c) => `        · ${c.metric} = ${c.value} (needs ${c.bound})`).join("\n")}`;
}
