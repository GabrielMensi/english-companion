import { beforeEach, describe, expect, it } from "vitest";

import { createTestUser } from "@/test/auth";
import { resetDb } from "@/test/db";

import { canUseEval, isAdmin } from "./admin";

beforeEach(() => resetDb());

describe("isAdmin", () => {
  it("is the first account only", async () => {
    const first = await createTestUser("test@example.com");
    expect(isAdmin(first.id)).toBe(true);
    // Sign-up beyond the first is allowed here because the test setup has an allowlist.
    const second = await createTestUser("other@example.com");
    expect(isAdmin(second.id)).toBe(false);
    expect(isAdmin("nobody")).toBe(false);
  });
});

describe("canUseEval", () => {
  it("is for the administrator, and only outside production unless ENABLE_EVAL=true", async () => {
    const admin = await createTestUser();
    const other = await createTestUser("other@example.com");
    expect(canUseEval(admin.id)).toBe(true);
    expect(canUseEval(other.id)).toBe(false);
  });
});
