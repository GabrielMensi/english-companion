/**
 * What can be opened without signing in (no server-only imports, unit tested): the login pages, the
 * auth API itself, the health check and the build's static files, none of which carry user data.
 * Everything else needs a session. A closed list on purpose: a new route is protected by default.
 */

const PUBLIC_PAGES = ["/login", "/signup"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];
const PUBLIC_API_EXACT = ["/api/health"];
const PUBLIC_FILES = ["/favicon.ico"];

/** Matches a file with an extension at the root of `public/` (`/logo.svg`), which has no data. */
const PUBLIC_ASSET = /^\/[\w.-]+\.(svg|png|jpg|jpeg|webp|ico|txt|webmanifest)$/i;

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API_EXACT.includes(pathname) || PUBLIC_FILES.includes(pathname)) {
    return true;
  }
  if (pathname.startsWith("/_next/")) return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return PUBLIC_ASSET.test(pathname);
}

/**
 * The `route.ts` files that skip `withUser`, as the folder under `src/app` (the regression test
 * checks that every other route answers 401 without a session).
 */
export const PUBLIC_ROUTE_FILES = ["api/auth/[...all]", "api/auth/signup-status", "api/health"];
