import Link from "next/link";
import { connection } from "next/server";
import { ClassManager } from "@/components/class/class-manager";
import { Page, PageHeader } from "@/components/layout/page";
import { NoProviderNotice } from "@/components/no-provider-notice";
import { Button } from "@/components/ui/button";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { getClassView } from "@/lib/class";
import { requirePageUser } from "@/lib/auth/session";

export default async function ClassPage() {
  await connection();
  const { userId } = await requirePageUser("/class");
  const hasModel = hasConfiguredProvider();

  return (
    <Page area="review" width="xl">
      <PageHeader
        title="Class"
        description="Your classes with the teacher: the report to take to each one, the level they gave you and the corrections they made."
        actions={
          <Button asChild>
            <Link href="/class/report">Report for the next class</Link>
          </Button>
        }
      />
      {!hasModel && (
        <NoProviderNotice detail="Classes and the report still work; structuring the teacher’s notes needs a key." />
      )}
      <ClassManager classes={getClassView(userId)} hasModel={hasModel} />
    </Page>
  );
}
