import { z } from "zod";
import { errorToMessage } from "@/lib/ai/fallback";
import { startCategoryPractice, startPractice, startTopicChat } from "@/lib/practice-start";
import { ERROR_CATEGORIES, TENSES } from "@/lib/taxonomy";
import { EXERCISE_KINDS } from "@/lib/tense-practice";
import { parseBody } from "@/lib/request-body";
import { resolveTopic } from "@/lib/topics";
import { logRouteError } from "@/lib/server-log";
import { withUser } from "@/lib/auth/with-user";

const bodySchema = z.union([
  z.object({
    kind: z.enum([...EXERCISE_KINDS, "conversation"]),
    tense: z.enum(TENSES),
    contrastWith: z.enum(TENSES).nullable().default(null),
  }),
  z.object({
    kind: z.literal("category"),
    category: z.enum(ERROR_CATEGORIES),
    subtype: z.string().max(100).nullable().default(null),
  }),
  // A preset id, or a custom topic (trimmed and capped in src/lib/topics.ts).
  z.object({
    kind: z.literal("topic"),
    preset: z.string().max(100).nullable().default(null),
    topic: z.string().max(500).default(""),
  }),
]);

/** Starts a practice chat (tense practice, exercises for an error category, or a topic conversation) and returns its session. */
export const POST = withUser(async (request: Request) => {
  const body = await parseBody(request, bodySchema, "Invalid data");
  if (!body.ok) return body.response;
  try {
    if (body.data.kind === "topic") {
      const choice = resolveTopic(body.data);
      if (!choice) return Response.json({ error: "Choose a topic or type one" }, { status: 400 });
      return Response.json(startTopicChat(choice), { status: 201 });
    }
    const session =
      body.data.kind === "category" ? await startCategoryPractice(body.data) : await startPractice(body.data);
    return Response.json(session, { status: 201 });
  } catch (error) {
    logRouteError("POST /api/practice", error, 502);
    return Response.json({ error: errorToMessage(error) }, { status: 502 });
  }
});
