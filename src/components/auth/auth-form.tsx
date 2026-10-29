"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, safeNextPath } from "@/lib/auth/auth-core";
import { authClient } from "@/lib/auth/client";

/** Better Auth's error codes, in the app's words. Anything else shows the server's message. */
function friendlyError(error: { message?: string; status?: number }, mode: "signin" | "signup"): string {
  if (error.status === 429) return "Too many attempts. Wait a few seconds and try again.";
  if (error.status === 401) return "Wrong email or password.";
  return error.message || (mode === "signin" ? "Couldn't sign in." : "Couldn't create the account.");
}

/** The login and sign-up form: same layout, the sign-up one also asks for a name. */
export function AuthForm({
  mode,
  next,
  signUpOpen,
}: {
  mode: "signin" | "signup";
  next?: string;
  signUpOpen?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signingUp = mode === "signup";

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    setPending(true);
    try {
      const { error } = signingUp
        ? await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() || email })
        : await authClient.signIn.email({ email, password });
      if (error) {
        setError(friendlyError(error, mode));
        return;
      }
      // A full navigation: the layout (sidebar, chats) has to be rendered again for the new user.
      router.replace(safeNextPath(next));
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 font-semibold">
          <GraduationCap className="size-5" />
          English Companion
        </div>
        <div className="border-l-[3px] border-primary pl-4">
          <h1 className="text-title font-semibold tracking-tight">{signingUp ? "Create your account" : "Sign in"}</h1>
          <p className="mt-1 text-muted-foreground">
            {signingUp ? "Your chats and progress are saved to your account." : "Welcome back."}
          </p>
        </div>

        {signingUp && signUpOpen === false ? (
          <p className="rounded-xl border bg-card p-5 text-sm" role="status">
            Sign-up is closed. Ask the person who runs this app to add your email.
          </p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {signingUp && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" required maxLength={80} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={signingUp ? "new-password" : "current-password"}
                required
                minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
                maxLength={MAX_PASSWORD_LENGTH}
              />
              {signingUp && <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}

        <p className="text-sm text-muted-foreground">
          {signingUp ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              First time here?{" "}
              <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
