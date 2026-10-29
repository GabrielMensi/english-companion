import { withUser } from "@/lib/auth/with-user";
import { importUserData } from "@/lib/data-transfer";
import { MAX_IMPORT_BYTES, parseExportFile } from "@/lib/data-transfer-core";
import { readBody } from "@/lib/request-body";
import { logRouteError } from "@/lib/server-log";

/** Adds an export file (from this or another install) to the signed-in account. Additive and repeatable. */
let importing = false;

export const POST = withUser(async (request: Request, _ctx, { userId }) => {
  // The import is one synchronous transaction: one at a time keeps the server from being tied up.
  if (importing) return Response.json({ error: "Another import is running. Try again in a moment." }, { status: 429 });
  importing = true;
  try {
    return await run(request, userId);
  } finally {
    importing = false;
  }
});

async function run(request: Request, userId: string) {
  const body = await readBody(request, MAX_IMPORT_BYTES);
  if (!body) return Response.json({ error: "The file is too big (max 10 MB)" }, { status: 413 });

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json({ error: "This is not a valid export file" }, { status: 400 });
  }
  const parsed = parseExportFile(raw);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json(importUserData(userId, parsed.file));
  } catch (error) {
    logRouteError("POST /api/data/import", error);
    return Response.json({ error: "The import failed and nothing was changed" }, { status: 500 });
  }
}
