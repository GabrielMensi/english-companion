// `next start` loads this file in the production image too: any local file imported here must also be
// copied in the Dockerfile (run stage), and must not import anything else from src/.
import { cspHeaderName, SCRIPT_CSP } from "./src/lib/csp";

import type { NextConfig } from "next";

// Same values as env.ts's flag; read when the server starts.
const cspReportOnly = ["true", "1"].includes(process.env.CSP_REPORT_ONLY ?? "");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  poweredByHeader: false,
  experimental: {
    // proxy.ts makes Next buffer request bodies up to this size (default 10 MB) and silently cut the
    // rest. Above the routes' own caps (10 MB for /api/transcribe), so an oversized upload still gets a 413.
    proxyClientMaxBodySize: "11mb",
  },
  // Bottom-left would cover the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  /**
   * Cross-origin isolation, so Kokoro's ONNX Runtime can run multithreaded WASM (threads need
   * SharedArrayBuffer, which browsers only allow in isolated pages). `credentialless` instead of
   * `require-corp`: cross-origin resources still load, just without cookies, so the Hugging Face
   * downloads and anything else external keep working without CORP headers. See docs/voice/VOICE.md.
   */
  async headers() {
    return [
      {
        // The build's files never go through the proxy (its matcher skips them): Kokoro's worker takes its
        // policy from this response. The policies live in src/lib/csp.ts.
        source: "/_next/static/:path*",
        headers: [{ key: cspHeaderName(cspReportOnly), value: SCRIPT_CSP }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // Other sites can't embed the app's pages or read its responses (see docs/platform/SECURITY_REVIEW.md).
          // The Content-Security-Policy of pages and API is set per request in src/proxy.ts (it needs a nonce).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          // The microphone is for dictation and read-aloud; nothing uses the camera or location.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
