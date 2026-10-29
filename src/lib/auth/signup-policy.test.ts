// The sign-up policy as wired into Better Auth, with the default configuration: no SIGNUP_ALLOWED_EMAILS,
// so only the first account can be created. (Its own file: the instance reads the variable once.)
import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { TEST_PASSWORD } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";

process.env.SIGNUP_ALLOWED_EMAILS = "";
const { getAuth } = await import("@/lib/auth/auth");

const signUp = (email: string) => getAuth().api.signUpEmail({ body: { email, password: TEST_PASSWORD, name: "A" } });
const users = () => db.select({ n: count() }).from(schema.authUser).get()?.n;

beforeEach(() => resetDb());

describe("closed instance (no list)", () => {
  it("lets the first account in and refuses every later one", async () => {
    await expect(signUp("first@example.com")).resolves.toBeTruthy();
    await expect(signUp("second@example.com")).rejects.toThrow(/Sign-up is closed/);
    expect(users()).toBe(1);
  });

  it("answers the same for an existing email as for a new one (no account enumeration)", async () => {
    await signUp("first@example.com");
    const existing = await signUp("first@example.com").catch((e: unknown) => e);
    const unknown = await signUp("nobody@example.com").catch((e: unknown) => e);
    for (const error of [existing, unknown]) expect(error).toMatchObject({ status: "FORBIDDEN" });
    expect((existing as Error).message).toBe((unknown as Error).message);
  });

  it("two first sign-ups at the same time leave exactly one account", async () => {
    const results = await Promise.allSettled([signUp("a@example.com"), signUp("b@example.com")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(users()).toBe(1);
  });
});
