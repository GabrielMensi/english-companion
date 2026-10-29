import { describe, expect, it } from "vitest";

import { API_CSP, makeNonce, pageCsp, policyKind, SCRIPT_CSP } from "./csp";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("pageCsp", () => {
  const csp = pageCsp({ nonce: "abc", dev: false });

  it("lets scripts run only with the nonce, plus WebAssembly for Kokoro, and never eval in production", () => {
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).toContain("'wasm-unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  it("allows the Hugging Face model downloads, blob workers and blob audio/images, and nothing else external", () => {
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "https://huggingface.co",
      "https://*.huggingface.co",
      "https://*.hf.co",
    ]);
    expect(directive(csp, "worker-src")).toEqual(["'self'", "blob:"]);
    expect(directive(csp, "media-src")).toContain("blob:");
    expect(directive(csp, "img-src")).toContain("blob:");
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("adds eval and the hot-reload socket in development only", () => {
    const dev = pageCsp({ nonce: "abc", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(directive(csp, "connect-src")).not.toContain("ws:");
  });
});

describe("other policies", () => {
  it("gives script files 'self' and WebAssembly, and no inline or eval", () => {
    expect(directive(SCRIPT_CSP, "script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(directive(SCRIPT_CSP, "connect-src")).toContain("https://huggingface.co");
  });

  it("lets API responses load nothing", () => {
    expect(directive(API_CSP, "default-src")).toEqual(["'none'"]);
    expect(directive(API_CSP, "script-src")).toEqual([]);
  });

  it("picks the policy by path", () => {
    expect(policyKind("/")).toBe("page");
    expect(policyKind("/chat/3")).toBe("page");
    expect(policyKind("/api/chat/send")).toBe("api");
    expect(policyKind("/api/tts/runtime/ort-wasm-simd-threaded.jsep.wasm")).toBe("script");
    expect(policyKind("/_next/static/chunks/a.js")).toBe("script");
  });
});

describe("makeNonce", () => {
  it("is different every time and safe in a header", () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
