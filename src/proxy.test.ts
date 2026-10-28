// proxy.ts: host, cross-site and the optimistic login check (a cookie must exist; the handlers check it for real).
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authCookiePrefix } from "@/lib/auth/auth-core";
import { proxy } from "./proxy";

// Locally the cookie name carries a prefix from the database path (see authCookiePrefix).
const PREFIX = authCookiePrefix({ databasePath: process.env.DATABASE_PATH ?? "", deployed: false });
const COOKIE = `${PREFIX}.session_token=anything.signature`;

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://127.0.0.1:3737${path}`, {
    method: init.method,
    headers: { host: "127.0.0.1:3737", ...init.headers },
  });
}

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy: login", () => {
  it("sends a signed-out page request to /login, remembering where it was going", () => {
    const res = proxy(request("/chat/abc?tab=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://127.0.0.1:3737/login?next=%2Fchat%2Fabc%3Ftab%3D1");
  });

  it("answers a signed-out API request with 401", async () => {
    const res = proxy(request("/api/sessions"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to continue" });
  });

  it("lets the public paths through without a cookie", () => {
    for (const path of ["/login", "/signup", "/api/auth/get-session", "/api/health", "/_next/webpack-hmr"]) {
      expect(passes(proxy(request(path))), path).toBe(true);
    }
  });

  it("lets a request with a session cookie through (the real check is in the handler)", () => {
    expect(passes(proxy(request("/dashboard", { headers: { cookie: COOKIE } })))).toBe(true);
    expect(passes(proxy(request("/api/sessions", { headers: { cookie: COOKIE } })))).toBe(true);
    // The __Secure- name used over https.
    const secure = { cookie: `__Secure-${COOKIE}` };
    expect(passes(proxy(request("/api/sessions", { headers: secure })))).toBe(true);
  });

  it("ignores a login cookie of another app on the same host (another port, another database)", () => {
    const other = { cookie: "ec-00000000.session_token=anything.signature" };
    expect(proxy(request("/api/sessions", { headers: other })).status).toBe(401);
    expect(proxy(request("/api/sessions", { headers: { cookie: "better-auth.session_token=a.b" } })).status).toBe(401);
  });

  it("ignores an unrelated cookie", () => {
    expect(proxy(request("/api/sessions", { headers: { cookie: "theme=dark" } })).status).toBe(401);
  });
});

describe("proxy: host and cross-site still come first", () => {
  it("refuses an unknown host even with a cookie", () => {
    const res = proxy(request("/dashboard", { headers: { host: "evil.example", cookie: COOKIE } }));
    expect(res.status).toBe(403);
  });

  it("refuses a cross-site write that carries a valid-looking cookie", () => {
    const attack = proxy(
      request("/api/sessions", {
        method: "POST",
        headers: { cookie: COOKIE, origin: "https://evil.test", "sec-fetch-site": "cross-site" },
      }),
    );
    expect(attack.status).toBe(403);
    const sameOrigin = proxy(
      request("/api/sessions", { method: "POST", headers: { cookie: COOKIE, "sec-fetch-site": "same-origin" } }),
    );
    expect(passes(sameOrigin)).toBe(true);
  });

  it("refuses a write with a foreign Origin and no Sec-Fetch-Site", () => {
    const res = proxy(request("/api/auth/sign-in/email", { method: "POST", headers: { origin: "https://evil.test" } }));
    expect(res.status).toBe(403);
  });
});
