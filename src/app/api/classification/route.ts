import { z } from "zod";
import { getClassificationStatus, retryFailedClassifications, startClassification } from "@/lib/classification";
import { parseBody } from "@/lib/request-body";

export function GET() {
  return Response.json(getClassificationStatus());
}

const bodySchema = z.object({ retryFailed: z.boolean().optional() });

/** Starts classifying pending mistakes in the background and returns the status right away. */
export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema, "Invalid data", { emptyAs: {} });
  if (body.ok && body.data.retryFailed) retryFailedClassifications();
  startClassification();
  return Response.json(getClassificationStatus());
}
