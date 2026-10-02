import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * Serves ONNX Runtime Web's WASM build to the Kokoro worker (see kokoro.worker.ts), so the app
 * doesn't depend on a CDN: these files come from the installed packages, at the exact version
 * transformers.js expects.
 */

const FILES: Record<string, string> = {
  "ort-wasm-simd-threaded.jsep.mjs": "text/javascript",
  "ort-wasm-simd-threaded.jsep.wasm": "application/wasm",
};

/** transformers.js is a dependency of kokoro-js, so it's found next to it (pnpm doesn't hoist it). */
async function runtimeDir() {
  const kokoro = await realpath(path.join(process.cwd(), "node_modules", "kokoro-js"));
  return path.join(kokoro, "..", "@huggingface", "transformers", "dist");
}

export async function GET(_request: Request, ctx: RouteContext<"/api/tts/runtime/[file]">) {
  const { file } = await ctx.params;
  const type = FILES[file];
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
}
