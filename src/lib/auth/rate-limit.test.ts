// Better Auth's rate limiter through its HTTP handler (auth.api.* calls skip it), with the rows in our table.
import { count } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getAuth } from "@/lib/auth/auth";
import { createTestUser, TEST_PASSWORD } from "@/test/auth";
import { db, resetDb, schema } from "@/test/db";

beforeEach(() => resetDb());

function signIn(headers: Record<string, string> = {}) {
  return getAuth().handler(
    new Request("http://127.0.0.1:3737/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: "test@example.com", password: `${TEST_PASSWORD} wrong` }),
    }),
  );
}

describe("sign-in rate limit", () => {
  it("answers 429 from the 4th try within the window, and stores the counter in the database", async () => {
    await createTestUser();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await signIn()).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect(db.select({ n: count() }).from(schema.authRateLimit).get()?.n).toBeGreaterThan(0);
  });

  it("does not let a client change its bucket with X-Forwarded-For", async () => {
    await createTestUser();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await signIn({ "x-forwarded-for": `203.0.113.${i + 1}` })).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect(db.select({ n: count() }).from(schema.authRateLimit).get()?.n).toBe(1);
  });
});
