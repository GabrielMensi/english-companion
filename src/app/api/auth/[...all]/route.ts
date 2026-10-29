import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/auth";

// Better Auth's own endpoints (sign-in, sign-up, sign-out, get-session). Public: they check themselves.
const handlers = toNextJsHandler((request) => getAuth().handler(request));

export const { GET, POST } = handlers;
