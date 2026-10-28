import { describe, expect, it } from "vitest";
import { checkThresholds, formatChecks } from "./thresholds";

const config = {
  default: { scorePct: { min: 85 }, failures: { max: 1 } },
  overrides: { "groq:slow": { scorePct: { min: 70 } } },
};

describe("checkThresholds", () => {
  it("passes when every metric is within its bounds (bounds are inclusive)", () => {
    const checks = checkThresholds({ scorePct: 85, failures: 1 }, config);
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a score under its minimum and a count over its maximum", () => {
    const checks = checkThresholds({ scorePct: 84, failures: 2 }, config);
    expect(checks.map((c) => [c.metric, c.pass])).toEqual([
      ["scorePct", false],
      ["failures", false],
    ]);
  });

  it("fails a bounded metric that is missing or not a number", () => {
    expect(checkThresholds({ failures: 0 }, config).find((c) => c.metric === "scorePct")?.pass).toBe(false);
    expect(checkThresholds({ scorePct: Number.NaN, failures: 0 }, config)[0].pass).toBe(false);
    expect(checkThresholds({ scorePct: null, failures: 0 }, config)[0].pass).toBe(false);
  });

  it("ignores metrics without a bound", () => {
    expect(checkThresholds({ scorePct: 90, failures: 0, avgSeconds: 99 }, config)).toHaveLength(2);
  });

  it("lets an override replace a default bound for one run", () => {
    expect(checkThresholds({ scorePct: 75, failures: 0 }, config).every((c) => c.pass)).toBe(false);
    expect(checkThresholds({ scorePct: 75, failures: 0 }, config, "groq:slow").every((c) => c.pass)).toBe(true);
  });
});

describe("formatChecks", () => {
  it("prints PASS, or FAIL with the metrics that missed", () => {
    expect(formatChecks("x", checkThresholds({ scorePct: 90, failures: 0 }, config))).toBe("PASS  x");
    const text = formatChecks("x", checkThresholds({ scorePct: 80, failures: 0 }, config));
    expect(text).toContain("FAIL  x");
    expect(text).toContain("scorePct = 80 (needs >= 85)");
    expect(text).not.toContain("failures");
  });
});
