import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { serverEnv } from "@/lib/env";
import {
  canSignUp,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  SIGNUP_CLOSED_MESSAGE,
  trustedOriginsFor,
} from "./auth-core";
import { getAuthSecret } from "./secret";

const SESSION_DAYS = 30;
/** Sign-in and sign-up allow this many tries per window (seconds): slows down guessing a password. */
const SIGN_IN_LIMIT = { window: 10, max: 3 };

function createAuth() {
  const env = serverEnv();
  const deployed = env.ALLOWED_HOSTS.length > 0;

  return betterAuth({
    secret: getAuthSecret(env),
    // Deploy: the public URL. Local: not fixed, the app runs on any loopback port (worktrees use other ports).
    baseURL: deployed
      ? env.BETTER_AUTH_URL
      : { allowedHosts: ["localhost:*", "127.0.0.1:*", "[::1]:*"], fallback: "https://127.0.0.1:3737" },
    trustedOrigins: (request) =>
      trustedOriginsFor({ allowedHosts: env.ALLOWED_HOSTS, origin: request?.headers.get("origin") ?? null }),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        rateLimit: schema.authRateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // No email provider: no verification and no reset by email (see pnpm auth:reset-password).
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * SESSION_DAYS,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      // Over http://127.0.0.1 (pnpm start) the "__Secure-" prefix can't be used; https in a deploy still sets Secure.
      useSecureCookies: deployed ? true : false,
      ...(env.TRUST_PROXY && { trustedProxyHeaders: true }),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { "/sign-in/email": SIGN_IN_LIMIT, "/sign-up/email": SIGN_IN_LIMIT },
    },
    databaseHooks: {
      user: {
        create: {
          // Every way of creating a user passes here, not only the sign-up endpoint.
          before: async (user) => {
            const userCount = db.select({ n: count() }).from(schema.authUser).get()?.n ?? 0;
            if (!canSignUp(normalizeEmail(user.email), { allowlist: env.SIGNUP_ALLOWED_EMAILS, userCount })) {
              throw new APIError("FORBIDDEN", { message: SIGNUP_CLOSED_MESSAGE });
            }
            return { data: { ...user, email: normalizeEmail(user.email) } };
          },
        },
      },
    },
    // Keep last: it writes the cookies Better Auth sets into Next's cookie store.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** The Better Auth instance, created on first use: importing this file (e.g. `next build`) needs no secret. */
export function getAuth(): Auth {
  return (instance ??= createAuth());
}
