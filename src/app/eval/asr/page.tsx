import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AsrRecorder } from "@/components/eval/asr-recorder";
import { ASR_SAMPLES } from "@/lib/eval/asr-samples";
import { listRecordedSamples } from "@/lib/eval/asr-store";
import { canUseEval } from "@/lib/auth/admin";
import { requirePageUser } from "@/lib/auth/session";

export default async function AsrEvalPage() {
  await connection();
  const user = await requirePageUser("/eval/asr");
  if (!canUseEval(user.userId)) notFound();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Speech-to-text test</h1>
          <p className="text-muted-foreground">
            Read each sentence aloud <strong className="text-foreground">exactly as written, mistakes included</strong>,
            at your normal speed. Then run <code className="rounded bg-muted px-1">pnpm eval:asr</code> to see which
            engines keep your mistakes and which ones “fix” them.
          </p>
        </div>
        <AsrRecorder samples={ASR_SAMPLES} initialRecorded={listRecordedSamples()} />
      </div>
    </div>
  );
}
