import { listRecordedSamples } from "@/lib/eval/asr-store";

export function GET() {
  return Response.json({ recorded: listRecordedSamples() });
}
