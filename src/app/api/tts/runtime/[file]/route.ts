import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { withUser } from "@/lib/auth/with-user";

/**
 * Serves ONNX Runtime Web's WASM build to the Kokoro worker (see kokoro.worker.ts), so the app
 * doesn't depend on a CDN: these files come from the installed packages, at the exact version
 * transformers.js expects.
 */

const FILES: Record<string, string> = {
  "ort-wasm-simd-threaded.jsep.mjs": "text/javascript",
  "ort-wasm-simd-threaded.jsep.wasm": "application/wasm",
};

/**
 * The onnxruntime-web that transformers.js imports (found next to it: pnpm doesn't hoist it), so
 * the WASM always matches the JS runtime, even when its version is overridden in pnpm-workspace.yaml.
 */
async function runtimeDir() {
  const transformers = await realpath(path.join(process.cwd(), "node_modules", "@huggingface", "transformers"));
  return path.join(transformers, "..", "..", "onnxruntime-web", "dist");
}

export const GET = withUser(async (_request: Request, ctx: RouteContext<"/api/tts/runtime/[file]">) => {
  const { file } = await ctx.params;
  // Own keys only: `FILES["constructor"]` would otherwise be truthy.
  const type = Object.hasOwn(FILES, file) ? FILES[file] : undefined;
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(await runtimeDir(), file));
    return new Response(data, {
      // Served from localhost, so re-reading is cheap; caching could pair a new runtime with an old WASM file.
      headers: { "Content-Type": type, "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
