// Runs in the browser before the app's code: configure zod before any library (e.g. "ai") builds a schema,
// so zod never probes `new Function` under the nonce CSP (#153).
import "@/lib/zod";
