import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Pure rules of the login (no server-only imports, unit tested): who can sign up, which origins are
 * trusted, which redirects are safe. The Better Auth setup that uses them is in auth.ts.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** The refusal for both a closed sign-up and an email that isn't on the list: it doesn't say who is. */
export const SIGNUP_CLOSED_MESSAGE = "Sign-up is closed";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether `email` can create an account. With a list (`SIGNUP_ALLOWED_EMAILS`), only those emails.
 * Without one, only the first account: once any user exists, sign-up is closed.
 */
export function canSignUp(email: string, options: { allowlist: readonly string[]; userCount: number }): boolean {
  if (options.allowlist.length > 0) return options.allowlist.includes(normalizeEmail(email));
  return options.userCount === 0;
}

/** Whether anyone could sign up right now (what /signup shows), without knowing the email. */
export function signUpOpen(options: { allowlist: readonly string[]; userCount: number }): boolean {
  return options.allowlist.length > 0 || options.userCount === 0;
}

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/** An http(s) origin on this machine, on any port: the same rule as allowed-hosts.ts. */
export function isLoopbackOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTNAMES.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The origins Better Auth trusts for a request. Locally (no `ALLOWED_HOSTS`): the request's own
 * `Origin` if it's loopback, whatever the port (worktrees run on other ports). In a deploy: https
 * for each allowed host, nothing else.
 */
export function trustedOriginsFor(options: { allowedHosts: readonly string[]; origin: string | null }): string[] {
  if (options.allowedHosts.length > 0) return options.allowedHosts.map((host) => `https://${host}`);
  return isLoopbackOrigin(options.origin) && options.origin ? [new URL(options.origin).origin] : [];
}

/**
 * Where to go after signing in (`?next=`): only a path inside the app. Anything that could leave it
 * (`//evil.test`, `/\evil.test`, `https://evil.test`, control characters) goes to the home page.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}

/**
 * The login cookie's name prefix. Cookies are scoped by host, not port, so a worktree on
 * 127.0.0.1:3747 would overwrite (and so sign out) the live app on 127.0.0.1:3737. Locally each
 * database gets its own prefix, from a hash of its path: every folder has its own database and secret.
 * A deploy keeps Better Auth's default (undefined).
 */
export function authCookiePrefix(options: { databasePath: string; deployed: boolean }): string | undefined {
  if (options.deployed) return undefined;
  const resolved = path.resolve(options.databasePath);
  return `ec-${createHash("sha256").update(resolved).digest("hex").slice(0, 8)}`;
}

/** Private and loopback ranges: the proxies that may sit in front of the app. */
const PRIVATE_RANGES = ["127.0.0.0/8", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

/**
 * Where the rate limiter takes the client's address from. Only with `TRUST_PROXY`, from
 * `X-Forwarded-For` read from the right: our own proxies (private ranges) are skipped and the first
 * other address is the client, so a value the client put at the front is never used. Without a
 * proxy no header is read: nothing a client sends changes which bucket it is in.
 */
export function ipAddressOptions(trustProxy: boolean) {
  return trustProxy
    ? { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: PRIVATE_RANGES }
    : { ipAddressHeaders: [] as string[] };
}
