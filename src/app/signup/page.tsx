import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthForm } from "@/components/auth/auth-form";
import { db, schema } from "@/db";
import { signUpOpen } from "@/lib/auth/auth-core";
import { getUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";

export const metadata = { title: "Create account · English Companion" };

export default async function SignUpPage() {
  await connection();
  if (await getUser()) redirect("/");
  const userCount = db.select({ n: count() }).from(schema.authUser).get()?.n ?? 0;
  return (
    <AuthForm mode="signup" signUpOpen={signUpOpen({ allowlist: serverEnv().SIGNUP_ALLOWED_EMAILS, userCount })} />
  );
}
