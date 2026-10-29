import { canUseEval } from "@/lib/auth/admin";
import { notFound, withUser } from "@/lib/auth/with-user";
import { listRecordedSamples } from "@/lib/eval/asr-store";

export const GET = withUser(async (_request, _ctx, { userId }) => {
  if (!canUseEval(userId)) return notFound();
  return Response.json({ recorded: listRecordedSamples() });
});
