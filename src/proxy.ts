import { type NextRequest, NextResponse } from "next/server";
import { isAllowedHost, requestHost } from "@/lib/allowed-hosts";
import { isCrossSiteWrite } from "@/lib/cross-site";
import { withCsp } from "@/lib/csp-response";
import { serverEnv } from "@/lib/env";

/**
 * Refuses requests for unknown hosts (DNS rebinding, see lib/allowed-hosts.ts) on pages and API, and
 * API writes coming from other sites (see lib/cross-site.ts). Sets the Content-Security-Policy
 * with `withCsp` (lib/csp-response.ts): use it for every pass-through response.
 */
export function proxy(request: NextRequest) {
  const { ALLOWED_HOSTS, TRUST_PROXY, CSP_REPORT_ONLY } = serverEnv();
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!isAllowedHost(requestHost(request, TRUST_PROXY), ALLOWED_HOSTS)) {
    const message = "Host not allowed. Open the app at localhost, or add the host to ALLOWED_HOSTS.";
    return isApi
      ? NextResponse.json({ error: message }, { status: 403 })
      : new NextResponse(message, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (isApi && isCrossSiteWrite(request, TRUST_PROXY)) {
    return NextResponse.json({ error: "Cross-site requests aren't allowed" }, { status: 403 });
  }

  return withCsp(request, CSP_REPORT_ONLY);
}

export const config = {
  // Everything but the build's static files (hashed JS/CSS, no user data): pages, API and the rest.
  matcher: "/((?!_next/static/).*)",
};
