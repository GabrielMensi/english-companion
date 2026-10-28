import type { AudioMetrics } from "@/components/audio/audio-check";
import type { GpuRejection, KokoroDevicePref } from "@/components/audio/speech-prefs";

/**
 * What the Kokoro worker learned while loading, for the "Copy diagnostics" button in Settings: with it, a
 * garbled-audio report (issue #45) says which GPU, driver-facing adapter data and audio-check numbers were
 * involved, without anyone having to guess.
 */

export interface GpuAdapterDetails {
  vendor: string | null;
  architecture: string | null;
  device: string | null;
  description: string | null;
  /** The browser's software adapter (SwiftShader): not a real GPU. */
  isFallbackAdapter: boolean | null;
  /** Whether the adapter supports fp16 shaders (the fp16 model needs it; the app uses fp32 anyway). */
  shaderF16: boolean;
}

/** The audio check on the test sentence, for one device the worker tried. */
export interface TestResult {
  device: "webgpu" | "wasm";
  dtype: string;
  ok: boolean;
  /** Why the check failed (null when it passed). */
  reason: string | null;
  metrics: AudioMetrics;
}

export interface KokoroDiagnostics {
  /** null when the browser has no WebGPU adapter. */
  adapter: GpuAdapterDetails | null;
  /** ONNX Runtime Web's version, as the worker sees it. */
  onnxRuntime: string | null;
  tests: TestResult[];
}

export interface DiagnosticsReportInput {
  userAgent: string;
  crossOriginIsolated: boolean;
  devicePref: KokoroDevicePref;
  running: { device: string; dtype: string; threads: number | null };
  warning: string | null;
  rejection: GpuRejection | null;
  diagnostics: KokoroDiagnostics | null;
}

const fixed = (n: number, digits = 3) => Number(n.toFixed(digits));

/** Plain-text report to paste into the issue; no learner text in it, only hardware and audio numbers. */
export function formatKokoroDiagnostics(input: DiagnosticsReportInput): string {
  const { diagnostics: d } = input;
  const lines = [
    "Kokoro diagnostics",
    `Browser: ${input.userAgent}`,
    `Cross-origin isolated: ${input.crossOriginIsolated}`,
    `Device setting: ${input.devicePref}`,
    `Running on: ${input.running.device}/${input.running.dtype}${input.running.threads ? `, ${input.running.threads} threads` : ""}`,
    `ONNX Runtime Web: ${d?.onnxRuntime ?? "unknown"}`,
  ];
  if (!d?.adapter) lines.push("WebGPU adapter: none");
  else {
    const a = d.adapter;
    lines.push(
      `WebGPU adapter: vendor=${a.vendor ?? "?"} architecture=${a.architecture ?? "?"} device=${a.device ?? "?"} ` +
        `description=${a.description ?? "?"} fallback=${a.isFallbackAdapter ?? "?"} shader-f16=${a.shaderF16}`,
    );
  }
  if (input.rejection) lines.push(`GPU rejected earlier: ${input.rejection.reason} (${input.rejection.at})`);
  if (input.warning) lines.push(`Warning: ${input.warning}`);
  for (const t of d?.tests ?? []) {
    const m = t.metrics;
    lines.push(
      `Audio check ${t.device}/${t.dtype}: ${t.ok ? "passed" : `FAILED (${t.reason})`}; rms=${fixed(m.rms)} peak=${fixed(m.peak)} ` +
        `clipped=${fixed(m.clipped)} nonFinite=${m.nonFinite} flatness=${fixed(m.flatness)} ` +
        `zcr=${fixed(m.zeroCrossingRate)} range=${fixed(m.dynamicRangeDb, 1)} dB`,
    );
  }
  return lines.join("\n");
}
