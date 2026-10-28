import { type NextRequest, NextResponse } from "next/server";
import { isAllowedHost, requestHost } from "@/lib/allowed-hosts";
import { isCrossSiteWrite } from "@/lib/cross-site";
import { API_CSP, makeNonce, pageCsp, policyKind, SCRIPT_CSP } from "@/lib/csp";
import { serverEnv } from "@/lib/env";

/**
 * Refuses requests for unknown hosts (DNS rebinding, see lib/allowed-hosts.ts) on pages and API, and
 * API writes coming from other sites (see lib/cross-site.ts). Sets the Content-Security-Policy (lib/csp.ts):
 * pages get a nonce, which Next reads from the request headers to tag its scripts and the layout reads from
 * `x-nonce` for next-themes' inline script.
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

  const kind = policyKind(request.nextUrl.pathname);
  const header = CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  if (kind !== "page") {
    const response = NextResponse.next();
    response.headers.set(header, kind === "script" ? SCRIPT_CSP : API_CSP);
    return response;
  }
  const nonce = makeNonce();
  const policy = pageCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(header, policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  return response;
}

export const config = {
  // Everything but the build's static files (hashed JS/CSS, no user data): pages, API and the rest.
  matcher: "/((?!_next/static/).*)",
};
