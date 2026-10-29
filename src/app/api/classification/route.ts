import { z } from "@/lib/zod";
import { getClassificationStatus, retryFailedClassifications, startClassification } from "@/lib/classification";
import { parseBody } from "@/lib/request-body";
import { withUser } from "@/lib/auth/with-user";

export const GET = withUser(async () => {
  return Response.json(getClassificationStatus());
});

const bodySchema = z.object({ retryFailed: z.boolean().optional() });

/** Starts classifying pending mistakes in the background and returns the status right away. */
export const POST = withUser(async (request: Request) => {
  const body = await parseBody(request, bodySchema, "Invalid data", { emptyAs: {} });
  if (body.ok && body.data.retryFailed) retryFailedClassifications();
  startClassification();
  return Response.json(getClassificationStatus());
});
