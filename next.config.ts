import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Bottom-left would cover the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  /**
   * Cross-origin isolation, so Kokoro's ONNX Runtime can run multithreaded WASM (threads need
   * SharedArrayBuffer, which browsers only allow in isolated pages). `credentialless` instead of
   * `require-corp`: cross-origin resources still load, just without cookies, so the Hugging Face
   * downloads and anything else external keep working without CORP headers. See docs/VOICE.md.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
