/**
 * `--check` for the eval scripts: prints PASS/FAIL per run against `thresholds.json` and sets a
 * non-zero exit code on any regression. Without the flag the evals only report, as before.
 */
import { checkThresholds, formatChecks, type ThresholdsFile } from "../../src/lib/eval/thresholds";
import thresholds from "./thresholds.json";

export function wantsCheck(args: readonly string[]): boolean {
  return args.includes("--check");
}

/** Reports one run; returns whether it passed. */
export function reportCheck(
  evalName: keyof typeof thresholds,
  spec: string,
  metrics: Record<string, number | null | undefined>,
): boolean {
  const checks = checkThresholds(metrics, (thresholds as ThresholdsFile)[evalName], spec);
  console.log(formatChecks(`${evalName} ${spec}`, checks));
  return checks.every((c) => c.pass);
}
