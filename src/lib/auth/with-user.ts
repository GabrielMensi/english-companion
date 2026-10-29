import "server-only";

import { requireUser, type SessionUser, UnauthorizedError } from "./session";

/**
 * Wraps a route handler so it only runs with a session: the user comes as the last argument, and
 * without one the answer is a 401 before the handler reads anything (not even the body). Every
 * `route.ts` handler goes through this, except the public ones in public-routes.ts.
 *
 *     export const GET = withUser(async (request, ctx, { userId }) => { ... });
 */
export function withUser<Req extends Request = Request, Ctx = unknown>(
  handler: (request: Req, ctx: Ctx, user: SessionUser) => Promise<Response>,
) {
  return async (request: Req, ctx?: Ctx): Promise<Response> => {
    let user: SessionUser;
    try {
      user = await requireUser(request.headers);
    } catch (error) {
      if (error instanceof UnauthorizedError) return unauthorized();
      throw error;
    }
    return handler(request, ctx as Ctx, user);
  };
}

export function unauthorized(): Response {
  return Response.json({ error: "Sign in to continue" }, { status: 401 });
}

export function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
