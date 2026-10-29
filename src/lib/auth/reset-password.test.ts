import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/lib/auth/auth";
import { createTestUser, TEST_PASSWORD } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";

import { resetPassword } from "./reset-password";

beforeEach(() => resetDb());

describe("resetPassword", () => {
  it("changes the password, closes the sessions and keeps the account", async () => {
    const user = await createTestUser();
    await resetPassword("Test@Example.com", "a brand new password");

    expect(db.select({ n: count() }).from(schema.authSession).get()?.n).toBe(0);
    const auth = getAuth();
    await expect(auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: "a brand new password" } }),
    ).resolves.toBeTruthy();
  });

  it("refuses a short password and an unknown email, changing nothing", async () => {
    const user = await createTestUser();
    await expect(resetPassword(user.email, "short")).rejects.toThrow(/10 to 128/);
    await expect(resetPassword("nobody@example.com", "a brand new password")).rejects.toThrow(/No account/);
    await expect(
      getAuth().api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } }),
    ).resolves.toBeTruthy();
  });
});
