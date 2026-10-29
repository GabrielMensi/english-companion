// The settings the evals run with: the administrator's (the first account), or the defaults when there is none yet.
import { asc } from "drizzle-orm";

export async function evalSettings() {
  const { db, schema } = await import("../../src/db");
  const { getSettings } = await import("../../src/lib/settings");
  const { DEFAULT_SETTINGS } = await import("../../src/lib/settings-core");
  const first = db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .orderBy(asc(schema.authUser.createdAt), asc(schema.authUser.id))
    .limit(1)
    .get();
  return first ? getSettings(first.id) : DEFAULT_SETTINGS;
}
