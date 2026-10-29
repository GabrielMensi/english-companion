/**
 * The parts of the login setup that use Node's modules (no server-only import, because proxy.ts uses
 * them too). Kept apart from auth-core.ts, which the login form imports in the browser: a node:crypto
 * import there would bundle a polyfill into /login and /signup.
 */
import { createHash } from "node:crypto";
import path from "node:path";

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
