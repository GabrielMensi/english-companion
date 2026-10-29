import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNextPath } from "@/lib/auth/auth-core";
import { getUser } from "@/lib/auth/session";

export const metadata = { title: "Sign in · English Companion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : undefined);
  if (await getUser()) redirect(target);
  return <AuthForm mode="signin" next={target} />;
}
