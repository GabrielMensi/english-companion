// The evals are the operator's local tools: they run as the administrator (the first account) and only read
// that account's data and settings. With no account yet they use the defaults and see no data.
import { asc } from "drizzle-orm";

/** The administrator's user id, or null when nobody has signed up yet. */
export async function evalUserId(): Promise<string | null> {
  const { db, schema } = await import("../../src/db");
  const first = db
    .select({ id: schema.authUser.id })
    .from(schema.authUser)
    .orderBy(asc(schema.authUser.createdAt), asc(schema.authUser.id))
    .limit(1)
    .get();
  return first?.id ?? null;
}

export async function evalSettings() {
  const { getSettings } = await import("../../src/lib/settings");
  const { DEFAULT_SETTINGS } = await import("../../src/lib/settings-core");
  const userId = await evalUserId();
  return userId ? getSettings(userId) : DEFAULT_SETTINGS;
}
