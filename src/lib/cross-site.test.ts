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

  it("lets non-browser clients through", () => {
    expect(isCrossSiteWrite(request("POST", {}))).toBe(false);
  });
});
