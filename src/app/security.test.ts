// Security regression tests (docs/platform/AUTH_MULTIUSER.md, #138): they walk the app's own files, so a
// route or page added later without a login check fails here by itself. Without a session every
// route handler answers 401 (before reading the body), every page redirects to /login, and the body
// limits still hold for signed-in users.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_FILES } from "@/lib/auth/public-routes";
import { MAX_JSON_BYTES } from "@/lib/request-body";
import { createTestUser, type TestUser } from "@/test/auth";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const APP_DIR = path.resolve("src/app");

type Handler = (request: Request, ctx: unknown) => Promise<Response> | Response;
const routeModules = import.meta.glob<Partial<Record<(typeof METHODS)[number], Handler>>>("./**/route.ts");

/** `./api/sessions/[id]/route.ts` -> `api/sessions/[id]` */
const folderOf = (key: string) => key.replace(/^\.\//, "").replace(/\/route\.ts$/, "");
const protectedRoutes = Object.entries(routeModules).filter(([key]) => !PUBLIC_ROUTE_FILES.includes(folderOf(key)));

/** Whatever dynamic segments a route has: `[id]`, `[file]`, `[...all]`. */
const CTX = { params: Promise.resolve({ id: "x", file: "x", all: ["x"] }) };

describe("route inventory", () => {
  it("finds the routes (the glob works)", () => {
    expect(Object.keys(routeModules).length).toBeGreaterThanOrEqual(20);
  });

  it("only lists public routes that exist", () => {
    const folders = Object.keys(routeModules).map(folderOf);
    for (const folder of PUBLIC_ROUTE_FILES) expect(folders, folder).toContain(folder);
  });
});

describe("every route needs a session", () => {
  it.each(protectedRoutes.map(([key, load]) => [folderOf(key), load] as const))("%s", async (folder, load) => {
    const routeModule = await load();
    const handlers = METHODS.filter((method) => routeModule[method]);
    expect(handlers.length, `${folder} exports no handler`).toBeGreaterThan(0);

    for (const method of handlers) {
      // A body that must not be read: a signed-out caller never gets the server to buffer anything.
      let bodyRead = false;
      // highWaterMark 0: the stream is only pulled when somebody reads it.
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            bodyRead = true;
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const hasBody = method !== "GET" && method !== "HEAD";
      const request = new Request(`http://test/${folder}`, {
        method,
        body: hasBody ? body : undefined,
        // @ts-expect-error `duplex` is required by Node for a streamed body and missing from the DOM types.
        duplex: hasBody ? "half" : undefined,
      });

      const res = await routeModule[method]!(request, CTX);
      expect(res.status, `${method} /${folder}`).toBe(401);
      expect(await res.json()).toEqual({ error: "Sign in to continue" });
      expect(bodyRead, `${method} /${folder} read the body of a signed-out request`).toBe(false);
    }
  });

  it("a made-up session cookie is refused too", async () => {
    const { GET } = await routeModules["./api/sessions/route.ts"]();
    const forged = new Request("http://test/api/sessions", { headers: { cookie: "better-auth.session_token=a.b" } });
    expect((await GET!(forged, undefined)).status).toBe(401);
  });
});

describe("public routes", () => {
  it("/api/health answers without a session", async () => {
    const { GET } = await routeModules["./api/health/route.ts"]();
    const res = await GET!(new Request("http://test/api/health"), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("/api/auth/signup-status only says whether sign-up is open", async () => {
    const { GET } = await routeModules["./api/auth/signup-status/route.ts"]();
    const res = await GET!(new Request("http://test/api/auth/signup-status"), undefined);
    expect(await res.json()).toEqual({ open: true });
  });
});

describe("every page checks the session", () => {
  function pageFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return pageFiles(full);
      return entry.name === "page.tsx" ? [full] : [];
    });
  }
  const pages = pageFiles(APP_DIR).map((file) => path.relative(APP_DIR, file));
  // The login pages are the way in; they send a signed-in user onward instead.
  const gated = pages.filter((page) => !["login/page.tsx", "signup/page.tsx"].includes(page));

  it("finds the pages", () => {
    expect(gated.length).toBeGreaterThanOrEqual(8);
  });

  it.each(gated)("%s calls requirePageUser", (page) => {
    const source = fs.readFileSync(path.join(APP_DIR, page), "utf8");
    expect(source).toMatch(/await requirePageUser\(/);
  });
});

describe("body limits for a signed-in user", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createTestUser();
  });

  it("an oversized recording is a 413 for /api/transcribe", async () => {
    const { POST } = await routeModules["./api/transcribe/route.ts"]();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await POST!(user.request("http://test/api/transcribe", { method: "POST", body: big }), undefined);
    expect(res.status).toBe(413);
  });

  it("a declared Content-Length over the limit is refused without reading the body", async () => {
    const { POST } = await routeModules["./api/transcribe/route.ts"]();
    const request = user.request("http://test/api/transcribe", {
      method: "POST",
      body: new Uint8Array(8),
      headers: { "content-length": String(11 * 1024 * 1024) },
    });
    expect((await POST!(request, undefined)).status).toBe(413);
  });

  it("an oversized JSON body is refused, not buffered", async () => {
    const { PATCH } = await routeModules["./api/settings/route.ts"]();
    const huge = JSON.stringify({ provider: "x".repeat(MAX_JSON_BYTES + 1) });
    const res = await PATCH!(user.request("http://test/api/settings", { method: "PATCH", body: huge }), undefined);
    expect(res.status).toBe(400);
  });

  it("401 wins over 413: a signed-out oversized upload is not read", async () => {
    const { POST } = await routeModules["./api/transcribe/route.ts"]();
    const res = await POST!(
      new Request("http://test/api/transcribe", { method: "POST", body: new Uint8Array(10 * 1024 * 1024 + 1) }),
      undefined,
    );
    expect(res.status).toBe(401);
  });
});
