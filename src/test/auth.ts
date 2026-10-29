// Login helpers for route tests: a real user and session in the test database, created through Better
// Auth itself, so `withUser` and the page guards run for real. See docs/platform/TESTING.md.
//
//   beforeEach(async () => { resetDb(); user = await createTestUser(); });
//   const res = await GET(user.request("http://test/api/settings"));   // signed in
//   const res = await GET(new Request("http://test/api/settings"));    // no session: 401
import { getAuth } from "@/lib/auth/auth";

/** Emails the test setup allows to sign up (SIGNUP_ALLOWED_EMAILS in setup.ts). */
export const TEST_EMAILS = ["test@example.com", "other@example.com", "third@example.com"] as const;
export const TEST_PASSWORD = "correct horse battery";

export interface TestUser {
  id: string;
  email: string;
  /** The `Cookie` header value that signs requests in as this user. */
  cookie: string;
  /** Headers with the session cookie, plus any `init` headers. */
  headers(init?: HeadersInit): Headers;
  /** A `Request` signed in as this user. */
  request(url: string, init?: RequestInit): Request;
}

/** Creates the account and signs it in. Call `resetDb()` first when tests share a database. */
export async function createTestUser(email: (typeof TEST_EMAILS)[number] = TEST_EMAILS[0]): Promise<TestUser> {
  const { headers, response } = await getAuth().api.signUpEmail({
    body: { email, password: TEST_PASSWORD, name: "Test user" },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  if (!cookie || !response.user) throw new Error("Test sign-up did not return a session");

  const withCookie = (init?: HeadersInit) => {
    const merged = new Headers(init);
    merged.set("cookie", cookie);
    return merged;
  };
  return {
    id: response.user.id,
    email,
    cookie,
    headers: withCookie,
    request: (url, init) => new Request(url, { ...init, headers: withCookie(init?.headers) }),
  };
}
