"use client";

import { useEffect } from "react";
import { Page, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";

/** A page that failed to render. The sidebar stays, so the rest of the app is still reachable. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page>
      <PageHeader
        title="Something went wrong"
        description="This page couldn’t load. Try again, or open another page from the sidebar."
        actions={<Button onClick={() => retry()}>Try again</Button>}
      />
    </Page>
  );
}
