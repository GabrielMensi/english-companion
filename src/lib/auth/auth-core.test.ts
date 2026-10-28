import { describe, expect, it } from "vitest";
import { canSignUp, isLoopbackOrigin, normalizeEmail, safeNextPath, signUpOpen, trustedOriginsFor } from "./auth-core";

describe("canSignUp", () => {
  it("with a list, lets in only the listed emails, whatever their case", () => {
    const options = { allowlist: ["ana@x.com", "bruno@y.com"], userCount: 3 };
    expect(canSignUp("ana@x.com", options)).toBe(true);
    expect(canSignUp("  Bruno@Y.com ", options)).toBe(true);
    expect(canSignUp("eve@z.com", options)).toBe(false);
  });

  it("with a list, the first account is not special", () => {
    expect(canSignUp("eve@z.com", { allowlist: ["ana@x.com"], userCount: 0 })).toBe(false);
  });

  it("without a list, only the first account", () => {
    expect(canSignUp("me@x.com", { allowlist: [], userCount: 0 })).toBe(true);
    expect(canSignUp("you@x.com", { allowlist: [], userCount: 1 })).toBe(false);
  });
});

describe("signUpOpen", () => {
  it("is open with a list, or while there is no account", () => {
    expect(signUpOpen({ allowlist: ["a@x.com"], userCount: 5 })).toBe(true);
    expect(signUpOpen({ allowlist: [], userCount: 0 })).toBe(true);
    expect(signUpOpen({ allowlist: [], userCount: 1 })).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => expect(normalizeEmail("  Ana@X.COM ")).toBe("ana@x.com"));
});

describe("isLoopbackOrigin", () => {
  it("accepts any port and scheme on this machine", () => {
    for (const origin of [
      "http://localhost:3737",
      "https://127.0.0.1:3747",
      "http://[::1]:3000",
      "https://localhost",
    ]) {
      expect(isLoopbackOrigin(origin), origin).toBe(true);
    }
  });

  it("refuses other hosts, lookalikes and junk", () => {
    for (const origin of [
      "https://evil.test",
      "https://localhost.evil.test",
      "http://127.0.0.1.evil.test",
      "http://evil.test/127.0.0.1",
      "ftp://localhost",
      "null",
      "",
      null,
      undefined,
    ]) {
      expect(isLoopbackOrigin(origin), String(origin)).toBe(false);
    }
  });
});

describe("trustedOriginsFor", () => {
  it("locally, trusts the request's own loopback origin", () => {
    expect(trustedOriginsFor({ allowedHosts: [], origin: "https://127.0.0.1:3747" })).toEqual([
      "https://127.0.0.1:3747",
    ]);
  });

  it("locally, trusts nothing for a foreign or missing origin", () => {
    expect(trustedOriginsFor({ allowedHosts: [], origin: "https://evil.test" })).toEqual([]);
    expect(trustedOriginsFor({ allowedHosts: [], origin: null })).toEqual([]);
  });

  it("in a deploy, trusts https for each allowed host and nothing else, not even loopback", () => {
    const options = { allowedHosts: ["companion.example.com"], origin: "http://localhost:3737" };
    expect(trustedOriginsFor(options)).toEqual(["https://companion.example.com"]);
  });
});

describe("safeNextPath", () => {
  it("keeps paths inside the app", () => {
    expect(safeNextPath("/chat/abc?x=1")).toBe("/chat/abc?x=1");
    expect(safeNextPath("/")).toBe("/");
  });

  it("sends anything that could leave the app to the home page", () => {
    for (const next of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "evil.test",
      "javascript:alert(1)",
      "/ok\nLocation: x",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(next), String(next)).toBe("/");
    }
  });
});
