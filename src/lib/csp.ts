/**
 * Content-Security-Policy, in one place (pure, so it can be tested; next.config.ts and proxy.ts both use it).
 *
 * Three policies:
 * - Pages (`pageCsp`): a fresh nonce per request, made by proxy.ts. Scripts run only with the nonce (Next adds
 *   it to its own scripts; `strict-dynamic` lets those load the rest of the bundle). Styles allow inline: React
 *   `style` props, Recharts, Radix and Sonner inject styles at runtime, and the floating window copies them.
 * - Scripts served as files (`SCRIPT_CSP`): `_next/static` and the ONNX runtime in `/api/tts/runtime`. A worker
 *   takes its policy from its own script's response, and Kokoro's worker has to import its chunks and compile
 *   WebAssembly, so it gets `'self'` and `wasm-unsafe-eval` (no nonce: nothing in it is inline).
 * - Everything else under /api (`API_CSP`): JSON and files, nothing may load from them.
 *
 * Adding a feature that loads from another origin (e.g. Better Auth's login with an external provider): add
 * its origin to the matching list below, nowhere else.
 */

/**
 * Where Kokoro downloads its model and voices: Hugging Face redirects the weights to its CDN
 * (`cdn-lfs*.huggingface.co`, or `*.hf.co` for the newer xet storage).
 */
const MODEL_HOSTS = ["https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co"];

/** Origins `fetch`/XHR/WebSocket may reach besides the app itself. Every AI call goes through the server. */
const CONNECT_HOSTS = [...MODEL_HOSTS];

function join(directives: Record<string, string[]>) {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/** Directives every policy has: nobody can embed the app, change its base URL or post forms elsewhere. */
const ALWAYS = {
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
};

export function pageCsp({ nonce, dev }: { nonce: string; dev: boolean }) {
  return join({
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Kokoro's ONNX Runtime compiles WebAssembly (in a worker, which can also be a blob: worker).
      "'wasm-unsafe-eval'",
      // React rebuilds server stacks with eval in development only.
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    // The dev server's hot reload talks over a WebSocket.
    "connect-src": ["'self'", ...CONNECT_HOSTS, ...(dev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'none'"],
    ...ALWAYS,
  });
}

export const SCRIPT_CSP = join({
  "default-src": ["'none'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  "connect-src": ["'self'", ...CONNECT_HOSTS],
  ...ALWAYS,
});

export const API_CSP = join({ "default-src": ["'none'"], ...ALWAYS });

/** A random nonce for one request (base64 of a UUID, as in Next's guide). */
export function makeNonce() {
  return btoa(crypto.randomUUID());
}

/** Which policy a path gets. `/_next/static` never reaches the proxy (see its matcher) but next.config.ts uses this. */
export function policyKind(pathname: string): "page" | "script" | "api" {
  if (pathname.startsWith("/api/tts/runtime/") || pathname.startsWith("/_next/static/")) return "script";
  if (pathname.startsWith("/api/")) return "api";
  return "page";
}
