import { describe, expect, it } from "vitest";

import { isAllowedHost, requestHost, withoutDefaultPort } from "./allowed-hosts";

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

describe("isAllowedHost: IPv6 literals", () => {
  it("allows a configured IPv6 literal on any port, and nothing close to it", () => {
    const allowed = ["[2001:db8::1]"];
    expect(isAllowedHost("[2001:db8::1]", allowed)).toBe(true);
    expect(isAllowedHost("[2001:DB8::1]:3737", allowed)).toBe(true);
    expect(isAllowedHost("[2001:db8::2]:3737", allowed)).toBe(false);
    expect(isAllowedHost("2001", allowed)).toBe(false);
  });
});

describe("withoutDefaultPort", () => {
  it("drops the port the scheme implies, and only that one", () => {
    expect(withoutDefaultPort("companion.example.com:443", "https:")).toBe("companion.example.com");
    expect(withoutDefaultPort("companion.example.com:80", "http:")).toBe("companion.example.com");
    expect(withoutDefaultPort("companion.example.com:443", "http:")).toBe("companion.example.com:443");
    expect(withoutDefaultPort("companion.example.com:3737", "https:")).toBe("companion.example.com:3737");
    expect(withoutDefaultPort("[::1]:443", "https:")).toBe("[::1]");
  });

  it("lowercases and drops a trailing dot, with or without a port", () => {
    expect(withoutDefaultPort("Companion.Example.com.:443", "https:")).toBe("companion.example.com");
    expect(withoutDefaultPort("Companion.Example.com.", "https:")).toBe("companion.example.com");
    expect(withoutDefaultPort("example.com.:8080", "https:")).toBe("example.com:8080");
  });
});

describe("requestHost", () => {
  const request = (headers: Record<string, string>) => new Request("https://localhost/", { headers });

  it("uses Host by default, ignoring X-Forwarded-Host (any client could send it)", () => {
    expect(requestHost(request({ host: "localhost:3737", "x-forwarded-host": "evil.example" }), false)).toBe(
      "localhost:3737",
    );
  });

  it("behind a trusted proxy, uses the last X-Forwarded-Host (the one the proxy appended)", () => {
    const headers = { host: "127.0.0.1:3737", "x-forwarded-host": "evil.example, companion.example.com" };
    expect(requestHost(request(headers), true)).toBe("companion.example.com");
  });

  it("falls back to Host when the proxy doesn't send X-Forwarded-Host", () => {
    expect(requestHost(request({ host: "localhost:3737" }), true)).toBe("localhost:3737");
  });
});
