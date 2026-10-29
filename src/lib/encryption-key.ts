import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type Env } from "@/lib/env";
import { parseEncryptionKey } from "@/lib/secrets-crypto";

const KEY_FILE = "encryption.key";

function invalid(file: string): Error {
  return new Error(
    `${file} is not a valid encryption key (32 random bytes in base64). Restore it from your backup; if it is lost, ` +
      "delete it and restart: a new one is generated and the saved API keys have to be pasted again.",
  );
}

/** The saved key; null when the file isn't there; throws when it is there but unusable. */
function readSaved(file: string): Buffer | null {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const key = parseEncryptionKey(text);
  if (!key) throw invalid(file);
  return key;
}

/**
 * The key that encrypts the saved API keys, then the old ones kept for decrypting (rotation). From
 * `APP_ENCRYPTION_KEY`; without it, locally, one is generated once in `encryption.key` next to the
 * database (owner-only). That protects a copy of the database taken without that folder; it does not
 * protect against someone who can read the whole `data/` folder. A deploy (`ALLOWED_HOSTS` set) never
 * generates one. Copy this file along with the database when you copy it (worktrees, other PCs).
 */
export function getEncryptionKeys(env: Env): Buffer[] {
  // Read on every API key lookup (several per page): resolved once per configuration.
  const id = JSON.stringify([
    env.DATABASE_PATH,
    env.APP_ENCRYPTION_KEY,
    env.APP_ENCRYPTION_KEYS_OLD,
    env.ALLOWED_HOSTS,
  ]);
  const hit = cache.get(id);
  if (hit) return hit;
  const keys = loadEncryptionKeys(env);
  cache.set(id, keys);
  return keys;
}

const cache = new Map<string, Buffer[]>();

function loadEncryptionKeys(env: Env): Buffer[] {
  const old = env.APP_ENCRYPTION_KEYS_OLD.map((k) => Buffer.from(k, "base64"));
  if (env.APP_ENCRYPTION_KEY) return [Buffer.from(env.APP_ENCRYPTION_KEY, "base64"), ...old];
  if (env.ALLOWED_HOSTS.length > 0) throw new Error("APP_ENCRYPTION_KEY is required when ALLOWED_HOSTS is set");

  const file = path.resolve(/*turbopackIgnore: true*/ path.dirname(env.DATABASE_PATH), KEY_FILE);
  const saved = readSaved(file);
  if (saved) return [saved, ...old];

  const key = randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // Complete temp file, then link it into place: never half-written, and the first process to link wins.
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${key.toString("base64")}\n`, { mode: 0o600 });
  try {
    fs.linkSync(temp, file);
    console.warn(`Generated ${file} to encrypt the saved API keys. Back it up apart from the database.`);
    return [key, ...old];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const winner = readSaved(file);
    if (!winner) throw invalid(file);
    return [winner, ...old];
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
