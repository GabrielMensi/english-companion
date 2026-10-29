import { ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { UndoDiscardButton } from "@/components/dashboard/undo-discard-button";
import { Page, PageHeader } from "@/components/layout/page";
import { requirePageUser } from "@/lib/auth/session";
import { DISCARDED_LIMIT, getDiscardedMistakes } from "@/lib/corrections";
import { categoryLabel } from "@/lib/taxonomy";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function DiscardedPage() {
  await connection();
  const { userId } = await requirePageUser("/dashboard/discarded");
  const { items, total } = getDiscardedMistakes(userId);

  return (
    <Page area="review" width="xl">
      <PageHeader
        title="Discarded mistakes"
        description="Corrections you marked as wrong. They don’t count in your stats; undo one to count it again."
        leading={
          <Link
            href="/dashboard"
            aria-label="Back to the dashboard"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing discarded.</p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-mark-wrong line-through">{m.original}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="text-mark-right">{m.correction}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {categoryLabel(m.category)} · {dateFormat.format(m.discardedAt)}
                    {m.reason && <> · “{m.reason}”</>}
                  </p>
                  <Link
                    href={`/chat/${m.sessionId}`}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <MessageSquare className="size-3.5" />
                    Open chat
                  </Link>
                </div>
                <UndoDiscardButton correctionId={m.id} />
              </li>
            ))}
          </ul>
          {total > DISCARDED_LIMIT && (
            <p className="text-sm text-muted-foreground">
              Showing the latest {DISCARDED_LIMIT} of {total}.
            </p>
          )}
        </>
      )}
    </Page>
  );
}
