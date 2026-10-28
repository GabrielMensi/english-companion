import { describe, expect, it } from "vitest";
import { formatKokoroDiagnostics, type DiagnosticsReportInput } from "./kokoro-diagnostics";

const metrics = {
  nonFinite: 0,
  peak: 0.5,
  clipped: 0,
  rms: 0.1,
  zeroCrossingRate: 0.05,
  flatness: 0.01,
  dynamicRangeDb: 60,
};
const base: DiagnosticsReportInput = {
  userAgent: "UA",
  crossOriginIsolated: true,
  devicePref: "auto",
  running: { device: "wasm", dtype: "fp32", threads: 8 },
  warning: null,
  rejection: null,
  diagnostics: null,
};

describe("formatKokoroDiagnostics", () => {
  it("reports the missing adapter and unknown runtime when the worker sent nothing", () => {
    const text = formatKokoroDiagnostics(base);
    expect(text).toContain("WebGPU adapter: none");
    expect(text).toContain("Running on: wasm/fp32, 8 threads");
  });

  it('doesn\'t call a forced-CPU run "no adapter"', () => {
    expect(formatKokoroDiagnostics({ ...base, devicePref: "wasm" })).toContain("not checked (Device = CPU)");
  });

  it("lists the adapter, the rejection and each audio check with its numbers", () => {
    const text = formatKokoroDiagnostics({
      ...base,
      rejection: { reason: "noise-like spectrum", at: "2026-10-28T00:00:00.000Z" },
      diagnostics: {
        adapter: {
          vendor: "amd",
          architecture: "rdna-4",
          device: "",
          description: "Radeon RX 9070 XT",
          isFallbackAdapter: false,
          shaderF16: true,
        },
        onnxRuntime: "1.30.0",
        tests: [
          {
            device: "webgpu",
            dtype: "fp32",
            ok: false,
            reason: "noise-like spectrum",
            metrics: { ...metrics, flatness: 0.5 },
          },
          { device: "wasm", dtype: "fp32", ok: true, reason: null, metrics },
        ],
      },
    });
    expect(text).toContain("vendor=amd architecture=rdna-4");
    expect(text).toContain("GPU rejected earlier: noise-like spectrum");
    expect(text).toContain(
      "Audio check webgpu/fp32: FAILED (noise-like spectrum); rms=0.1 peak=0.5 clipped=0 nonFinite=0 flatness=0.5",
    );
    expect(text).toContain("Audio check wasm/fp32: passed");
  });
});
