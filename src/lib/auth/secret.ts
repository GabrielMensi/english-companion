import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Env } from "@/lib/env";

const SECRET_FILE = "auth.secret";
const MIN_LENGTH = 32;

function invalid(file: string): Error {
  return new Error(
    `${file} is empty or too short to sign the login cookies (at least ${MIN_LENGTH} characters). ` +
      "Delete it and restart: a new one is generated (everyone signs in again).",
  );
}

/** The saved secret; null when the file isn't there; throws when it is there but unusable. */
function readSaved(file: string): string | null {
  let saved: string;
  try {
    saved = fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
  // Better Auth would silently fall back to a public default secret for an empty one.
  if (saved.length < MIN_LENGTH) throw invalid(file);
  return saved;
}

/**
 * The key that signs the login cookies. From `BETTER_AUTH_SECRET`; without it, locally, one is
 * generated once in `auth.secret` next to the database (owner-only) so the login survives restarts.
 * A deploy (`ALLOWED_HOSTS` set) never generates one: it must come from the environment. A saved
 * file that is empty or short is an error, never used and never replaced behind your back.
 */
export function getAuthSecret(env: Env): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.ALLOWED_HOSTS.length > 0) throw new Error("BETTER_AUTH_SECRET is required when ALLOWED_HOSTS is set");

  const file = path.resolve(/*turbopackIgnore: true*/ path.dirname(env.DATABASE_PATH), SECRET_FILE);
  const saved = readSaved(file);
  if (saved) return saved;

  const secret = randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // Write a complete temp file, then link it into place: the file never exists half-written, and
  // `link` fails if another process (parallel build workers) created it first, then theirs is used.
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${secret}\n`, { mode: 0o600 });
  try {
    fs.linkSync(temp, file);
    return secret;
  } catch {
    const winner = readSaved(file);
    if (!winner) throw invalid(file);
    return winner;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
