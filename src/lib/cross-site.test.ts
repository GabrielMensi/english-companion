import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./cross-site";

function request(method: string, headers: Record<string, string>) {
  return new Request("https://localhost:3737/api/sessions", {
    method,
    headers: { host: "localhost:3737", ...headers },
  });
}

describe("isCrossSiteWrite", () => {
  it("lets reads through from anywhere", () => {
    expect(isCrossSiteWrite(request("GET", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("refuses writes from another site, including another port on the same host", () => {
    expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteWrite(request("DELETE", { "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("allows writes from the app itself", () => {
    expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("falls back to the Origin header when the browser doesn't send Sec-Fetch-Site", () => {
    expect(isCrossSiteWrite(request("POST", { origin: "https://localhost:3737" }))).toBe(false);
    expect(isCrossSiteWrite(request("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteWrite(request("POST", { origin: "null" }))).toBe(true);
  });

  it("behind a trusted proxy, compares the Origin with X-Forwarded-Host", () => {
    const proxied = { host: "127.0.0.1:3737", "x-forwarded-host": "companion.example.com" };
    expect(isCrossSiteWrite(request("POST", { ...proxied, origin: "https://companion.example.com" }), true)).toBe(
      false,
    );
    expect(isCrossSiteWrite(request("POST", { ...proxied, origin: "https://evil.example" }), true)).toBe(true);
    // Without TRUST_PROXY the forwarded header is ignored, so the app's real origin doesn't match Host.
    expect(isCrossSiteWrite(request("POST", { ...proxied, origin: "https://companion.example.com" }))).toBe(true);
  });

  it("matches an X-Forwarded-Host that carries the scheme's default port (Origin never does)", () => {
    const forwarded = (host: string) => ({ host: "127.0.0.1:3737", "x-forwarded-host": host });
    const post = (host: string, origin: string) =>
      isCrossSiteWrite(request("POST", { ...forwarded(host), origin }), true);
    expect(post("companion.example.com:443", "https://companion.example.com")).toBe(false);
    expect(post("Companion.Example.com.:443", "https://companion.example.com")).toBe(false);
    expect(post("companion.example.com:80", "http://companion.example.com")).toBe(false);
    // A real port still has to match, and :443 doesn't excuse another scheme or host.
    expect(post("companion.example.com:8443", "https://companion.example.com")).toBe(true);
    expect(post("companion.example.com:443", "http://companion.example.com")).toBe(true);
    expect(post("evil.example:443", "https://companion.example.com")).toBe(true);
    expect(post("companion.example.com:8443", "https://companion.example.com:8443")).toBe(false);
  });

  it("matches IPv6 hosts", () => {
    const post = (host: string, origin: string) => isCrossSiteWrite(request("POST", { host, origin }));
    expect(post("[::1]:3737", "https://[::1]:3737")).toBe(false);
    expect(post("[::1]:3737", "https://[::2]:3737")).toBe(true);
  });

  it("lets non-browser clients through", () => {
    expect(isCrossSiteWrite(request("POST", {}))).toBe(false);
  });
});
