import { describe, expect, it } from "vitest";
import { isAllowedHost, requestHost } from "./allowed-hosts";

describe("isAllowedHost", () => {
  it("allows loopback names on any port", () => {
    for (const host of ["localhost", "localhost:3737", "127.0.0.1:3742", "[::1]:3737", "[::1]", "LOCALHOST:3737"]) {
      expect(isAllowedHost(host, []), host).toBe(true);
    }
  });

  it("refuses other hosts, as in DNS rebinding", () => {
    for (const host of ["evil.example", "evil.example:3737", "localhost.evil.example", "192.168.1.44:3737", "[::2]"]) {
      expect(isAllowedHost(host, []), host).toBe(false);
    }
  });

  it("refuses a missing or malformed Host", () => {
    expect(isAllowedHost(null, [])).toBe(false);
    expect(isAllowedHost("", [])).toBe(false);
    expect(isAllowedHost("[::1", [])).toBe(false);
  });

  it("allows the configured hosts, on any port and ignoring case and a trailing dot", () => {
    const allowed = ["companion.example.com"];
    expect(isAllowedHost("companion.example.com", allowed)).toBe(true);
    expect(isAllowedHost("Companion.Example.com.:443", allowed)).toBe(true);
    expect(isAllowedHost("evil.companion.example.com", allowed)).toBe(false);
  });
});

describe("requestHost", () => {
  const request = (headers: Record<string, string>) => new Request("https://localhost/", { headers });

  it("uses Host by default, ignoring X-Forwarded-Host (any client could send it)", () => {
    expect(requestHost(request({ host: "localhost:3737", "x-forwarded-host": "evil.example" }), false)).toBe(
      "localhost:3737",
    );
  });

  it("behind a trusted proxy, uses the first X-Forwarded-Host", () => {
    const headers = { host: "127.0.0.1:3737", "x-forwarded-host": "companion.example.com, internal:8080" };
    expect(requestHost(request(headers), true)).toBe("companion.example.com");
  });

  it("falls back to Host when the proxy doesn't send X-Forwarded-Host", () => {
    expect(requestHost(request({ host: "localhost:3737" }), true)).toBe("localhost:3737");
  });
});
