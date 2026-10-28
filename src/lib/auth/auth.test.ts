// Integration test of the login setup (docs/platform/AUTH_MULTIUSER.md): sign-up policy, sessions.
import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/auth";
import { createTestUser, TEST_PASSWORD } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";

beforeEach(() => resetDb());

describe("sessions", () => {
  it("signs up, finds the session from the cookie and signs out", async () => {
    const user = await createTestUser();
    const auth = getAuth();

    const session = await auth.api.getSession({ headers: user.headers() });
    expect(session?.user.email).toBe(user.email);

    await auth.api.signOut({ headers: user.headers() });
    // The row is gone. A copy of the cookie still works until the 5-minute cookie cache expires (documented).
    expect(db.select({ n: count() }).from(schema.authSession).get()?.n).toBe(0);
    const tokenOnly = new Headers({ cookie: user.cookie.split("; ").find((c) => c.includes("session_token")) ?? "" });
    expect(await auth.api.getSession({ headers: tokenOnly })).toBeNull();
  });

  it("gives no session for a made-up cookie", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=made-up.signature" });
    expect(await getAuth().api.getSession({ headers })).toBeNull();
  });

  it("signs in with the password, and refuses a wrong one", async () => {
    const user = await createTestUser();
    const auth = getAuth();
    await expect(auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })).resolves.toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email: user.email, password: "not the password" } })).rejects.toThrow();
  });

  it("stores only a hash of the password", async () => {
    await createTestUser();
    const [account] = db.select().from(schema.authAccount).all();
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(TEST_PASSWORD);
  });
});

describe("sign-up policy", () => {
  it("refuses an email that is not on SIGNUP_ALLOWED_EMAILS, whatever its case", async () => {
    const auth = getAuth();
    await expect(
      auth.api.signUpEmail({ body: { email: "stranger@example.com", password: TEST_PASSWORD, name: "Stranger" } }),
    ).rejects.toThrow(/Sign-up is closed/);
    expect(db.select({ n: count() }).from(schema.authUser).get()?.n).toBe(0);

    const ok = await auth.api.signUpEmail({ body: { email: "TEST@Example.com", password: TEST_PASSWORD, name: "A" } });
    expect(ok.user.email).toBe("test@example.com");
  });

  it("refuses a password shorter than 10 characters", async () => {
    await expect(
      getAuth().api.signUpEmail({ body: { email: "test@example.com", password: "short", name: "A" } }),
    ).rejects.toThrow();
  });

  it("refuses a second account with the same email", async () => {
    await createTestUser();
    await expect(createTestUser()).rejects.toThrow();
  });
});
