"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

/** Ends the session on the server, then goes to /login (the layout renders again without the user's data). */
export function SignOutButton(props: React.ComponentProps<typeof Button>) {
  const router = useRouter();

  async function signOut() {
    // Stay on the page when it fails: the session and the cookie are still alive.
    const failed = await authClient
      .signOut()
      .then(({ error }) => Boolean(error))
      .catch(() => true);
    if (failed) {
      toast.error("Couldn't sign out. Try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      // Extra props (e.g. from a tooltip trigger) go to the underlying button.
      {...props}
      variant="ghost"
      size="icon-sm"
      aria-label="Sign out"
      onClick={() => void signOut()}
    >
      <LogOut />
    </Button>
  );
}
