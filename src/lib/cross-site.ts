/**
 * Refusing state-changing API calls from other sites (no server-only imports, unit tested). The login
 * cookie is SameSite=Lax, but this is the first layer: any page the learner visits could otherwise POST to the API from their browser:
 * a plain-text POST needs no CORS preflight, and the routes parse the body whatever its type.
 */

import { requestHost, withoutDefaultPort } from "./allowed-hosts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a request that changes something comes from another site. Browsers send
 * `Sec-Fetch-Site`; without it, the `Origin` must match the host. Requests with neither come from
 * outside a browser (curl, scripts) and are let through: they're not a CSRF vector. Behind a trusted
 * reverse proxy (`TRUST_PROXY`), the host the browser used is in `X-Forwarded-Host`.
 */
export function isCrossSiteWrite(request: Request, trustProxy = false): boolean {
  if (SAFE_METHODS.has(request.method)) return false;

  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const { host, protocol } = new URL(origin);
    const expected = requestHost(request, trustProxy);
    // URL#host already drops the scheme's default port; the header may still carry it (":443" from a proxy).
    return !expected || host !== withoutDefaultPort(expected, protocol);
  } catch {
    return true; // "null" (sandboxed iframes, file://) or garbage
  }
}
