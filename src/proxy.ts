import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isAllowedHost, requestHost } from "@/lib/allowed-hosts";
import { isPublicPath } from "@/lib/auth/public-routes";
import { isCrossSiteWrite } from "@/lib/cross-site";
import { serverEnv } from "@/lib/env";

/**
 * Where to send a signed-out page request. Next needs an absolute URL, and behind a reverse proxy
 * `request.url` has the internal host, so the public one comes from the same headers as the host check.
 */
function loginUrl(request: NextRequest, trustProxy: boolean, next: string): URL {
  const host = requestHost(request, trustProxy) ?? request.nextUrl.host;
  const forwardedProto = trustProxy ? request.headers.get("x-forwarded-proto")?.split(",").at(-1)?.trim() : undefined;
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : request.nextUrl.protocol;
  return new URL(`/login?next=${encodeURIComponent(next)}`, `${protocol.replace(/:$/, "")}://${host}`);
}

/**
 * Refuses requests for unknown hosts (DNS rebinding, see lib/allowed-hosts.ts) on pages and API,
 * API writes coming from other sites (see lib/cross-site.ts) and, outside the public list
 * (lib/auth/public-routes.ts), requests without a session cookie. That last check is only
 * optimistic (a made-up cookie passes): every route handler and page checks the real session.
 */
export function proxy(request: NextRequest) {
  const { ALLOWED_HOSTS, TRUST_PROXY } = serverEnv();
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
  const { pathname, search } = request.nextUrl;
  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    if (isApi) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    return NextResponse.redirect(loginUrl(request, TRUST_PROXY, pathname + search));
  }
  return NextResponse.next();
}

export const config = {
  // Everything but the build's static files (hashed JS/CSS, no user data): pages, API and the rest.
  matcher: "/((?!_next/static/).*)",
};
