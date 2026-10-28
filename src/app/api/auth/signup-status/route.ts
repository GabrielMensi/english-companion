import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { signUpOpen } from "@/lib/auth/auth-core";
import { serverEnv } from "@/lib/env";

/** Whether /signup should show the form: public, and it only says yes or no. */
export function GET() {
  const userCount = db.select({ n: count() }).from(schema.authUser).get()?.n ?? 0;
  return Response.json({ open: signUpOpen({ allowlist: serverEnv().SIGNUP_ALLOWED_EMAILS, userCount }) });
}
