import "server-only";

import { asc } from "drizzle-orm";

import { db, schema } from "@/db";
import { evalEnabled, serverEnv } from "@/lib/env";

/** The administrator is the first account created. */
export function isAdmin(userId: string): boolean {
  const first = db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .orderBy(asc(schema.authUser.createdAt), asc(schema.authUser.id))
    .limit(1)
    .get();
  return first?.id === userId;
}

/**
 * Whether this user can use the speech-to-text eval (it writes recordings to disk): development, or
 * `ENABLE_EVAL=true`, and only the administrator. Otherwise the pages and routes answer 404.
 */
export function canUseEval(userId: string): boolean {
  return evalEnabled(serverEnv(), process.env.NODE_ENV) && isAdmin(userId);
}
