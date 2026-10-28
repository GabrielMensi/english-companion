import { z } from "zod";
import { getPronunciationSummary, saveAttempt } from "@/lib/read-aloud";
import { isBetaPronunciation, PRONUNCIATION_CATEGORIES } from "@/lib/taxonomy";
import { readJson } from "@/lib/request-body";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  source: z.enum(["sounds", "correction", "vocabulary", "review"]),
  sourceId: z.string().nullable(),
  focus: z
    .enum(PRONUNCIATION_CATEGORIES)
    .refine((c) => !isBetaPronunciation(c))
    .nullable(),
  transcript: z.string().max(2000),
  transcriptionProvider: z.string().nullable(),
  transcriptionModel: z.string().nullable(),
  audioDurationMs: z.number().int().nonnegative().nullable(),
});

/** Scores and saves a read-aloud attempt (already transcribed with /api/transcribe). */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json({ error: "Invalid data" }, { status: 400 });
  const result = saveAttempt(body.data);
  return Response.json({ result, summary: getPronunciationSummary() });
}
