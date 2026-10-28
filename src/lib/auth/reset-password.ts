import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from "./auth-core";
import { getAuth } from "./auth";

/**
 * The administrator's way to give someone a new password (there is no email to send a link by): hashes
 * it like sign-up does, replaces the credential and closes every session of that account. Used by
 * `pnpm auth:reset-password`. It goes through the core's hasher, not `auth.api.setUserPassword`, which
 * belongs to the admin plugin and needs an admin session.
 */
export async function resetPassword(email: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`The password must have ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }
  const user = db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .where(eq(schema.authUser.email, normalizeEmail(email)))
    .get();
  if (!user) throw new Error("No account with that email.");

  const hash = await (await getAuth().$context).password.hash(password);
  db.transaction((tx) => {
    const changed = tx
      .update(schema.authAccount)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(schema.authAccount.userId, user.id), eq(schema.authAccount.providerId, "credential")))
      .run().changes;
    if (changed === 0) throw new Error("That account has no password to reset.");
    tx.delete(schema.authSession).where(eq(schema.authSession.userId, user.id)).run();
  });
}
