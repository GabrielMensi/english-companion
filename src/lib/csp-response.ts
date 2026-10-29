import { type NextRequest, NextResponse } from "next/server";

import { API_CSP, cspHeaderName, makeNonce, pageCsp, policyKind, SCRIPT_CSP } from "@/lib/csp";

/**
 * The pass-through response of the proxy with the Content-Security-Policy for this path (see csp.ts):
 * every `NextResponse.next()` the proxy returns for a page or API route must come from here. Pages get a
 * fresh nonce, in the request headers (Next reads it from there to tag its scripts) and in `x-nonce` (the
 * layout hands it to next-themes). Redirects and error responses carry no markup and need no policy.
 */
export function withCsp(request: NextRequest, reportOnly: boolean) {
  const header = cspHeaderName(reportOnly);
  const kind = policyKind(request.nextUrl.pathname);
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
