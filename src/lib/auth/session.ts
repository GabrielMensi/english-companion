import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue");
    this.name = "UnauthorizedError";
  }
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
}

/**
 * The signed-in user, read from the session in the database (not only the cookie's presence, which is
 * all proxy.ts checks), or null. Route handlers pass their request's headers; pages and the layout
 * use Next's.
 */
export async function getUser(requestHeaders?: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders ?? (await headers()) });
  if (!session) return null;
  return { userId: session.user.id, email: session.user.email, name: session.user.name };
}

/** Like `getUser`, but throws `UnauthorizedError` (what `withUser` turns into a 401) without a session. */
export async function requireUser(requestHeaders?: Headers): Promise<SessionUser> {
  const user = await getUser(requestHeaders);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** First line of every page: the signed-in user, or a redirect to /login that comes back to this page. */
export async function requirePageUser(path: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return user;
}
