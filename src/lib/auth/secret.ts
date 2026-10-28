import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Env } from "@/lib/env";

const SECRET_FILE = "auth.secret";

/**
 * The key that signs the login cookies. From `BETTER_AUTH_SECRET`; without it, locally, one is
 * generated once in `auth.secret` next to the database (owner-only) so the login survives restarts.
 * A deploy (`ALLOWED_HOSTS` set) never generates one: it must come from the environment.
 */
export function getAuthSecret(env: Env): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.ALLOWED_HOSTS.length > 0) throw new Error("BETTER_AUTH_SECRET is required when ALLOWED_HOSTS is set");

  const file = path.resolve(/*turbopackIgnore: true*/ path.dirname(env.DATABASE_PATH), SECRET_FILE);
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  } catch {
    // Not there yet: created below.
  }
  const secret = randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // "wx" fails if another process created it first (parallel build workers): then read theirs.
  try {
    fs.writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: "wx" });
    return secret;
  } catch {
    return fs.readFileSync(file, "utf8").trim();
  }
}
