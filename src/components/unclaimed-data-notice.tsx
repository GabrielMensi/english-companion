/** Shown to the first account while the data from before accounts existed still has no owner. */
export function UnclaimedDataNotice({ email }: { email: string }) {
  return (
    <div
      role="status"
      className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
    >
      Your earlier chats, mistakes and flashcards aren’t assigned to an account yet, so they don’t show here. In the
      app’s folder, run{" "}
      <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
        pnpm auth:claim-data {email}
      </code>{" "}
      to bring them in.
    </div>
  );
}
