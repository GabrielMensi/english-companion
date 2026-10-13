/**
 * Which `Host` the app answers to (no server-only imports, unit tested). Against DNS rebinding: a page
 * on evil.example can make its own domain resolve to 127.0.0.1 and then read the API as "same-origin",
 * but the browser still sends `Host: evil.example`, so refusing unknown hosts stops it.
 */

/** Always allowed, on any port: the machine itself. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The host the client asked for. Behind a reverse proxy (`trustProxy`), that's the last value of
 * `X-Forwarded-Host`, since `Host` is whatever the proxy used to reach the app. The last one is the
 * value our proxy added: a proxy that appends instead of overwriting keeps whatever the client sent
 * in front. Off by default: without a proxy in front, any client could send that header.
 */
export function requestHost(request: Request, trustProxy: boolean): string | null {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-host")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  return request.headers.get("host");
}

/** The hostname of a `Host` value, without the port, lowercased and without a trailing dot. */
function hostname(host: string): string {
  const value = host.trim().toLowerCase();
  // IPv6 literals come in brackets ("[::1]:3737"); their colons aren't a port.
  const name = value.startsWith("[") ? value.slice(0, value.indexOf("]") + 1) : value.split(":")[0];
  return name.endsWith(".") ? name.slice(0, -1) : name;
}

/**
 * Whether the app should answer a request for `host`: loopback names, plus the hostnames in
 * `ALLOWED_HOSTS` (any port). A missing `Host` is refused: HTTP/1.1 requires it.
 */
export function isAllowedHost(host: string | null, allowed: readonly string[]): boolean {
  if (!host) return false;
  const name = hostname(host);
  return LOOPBACK_HOSTS.includes(name) || allowed.some((entry) => hostname(entry) === name);
}
