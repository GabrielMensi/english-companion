import { describe, expect, it } from "vitest";

import { authCookiePrefix, ipAddressOptions } from "./auth-node";

describe("authCookiePrefix", () => {
  it("differs per database, so two local apps on one host keep separate logins", () => {
    const live = authCookiePrefix({ databasePath: "/home/me/english-companion/data/companion.db", deployed: false });
    const tree = authCookiePrefix({ databasePath: "/home/me/ec-worktrees/auth/data/dev.db", deployed: false });
    expect(live).toMatch(/^ec-[0-9a-f]{8}$/);
    expect(tree).not.toBe(live);
  });

  it("is stable for the same path, however it is spelled", () => {
    const a = authCookiePrefix({ databasePath: "data/../data/x.db", deployed: false });
    expect(a).toBe(authCookiePrefix({ databasePath: "data/x.db", deployed: false }));
  });

  it("keeps Better Auth's default in a deploy", () => {
    expect(authCookiePrefix({ databasePath: "/data/companion.db", deployed: true })).toBeUndefined();
  });
});

describe("ipAddressOptions", () => {
  it("reads no header without a trusted proxy", () => {
    expect(ipAddressOptions(false)).toEqual({ ipAddressHeaders: [] });
  });

  it("behind our proxy, reads X-Forwarded-For from the right, skipping private hops", () => {
    const options = ipAddressOptions(true);
    expect(options.ipAddressHeaders).toEqual(["x-forwarded-for"]);
    expect(options.trustedProxies).toContain("10.0.0.0/8");
  });
});
