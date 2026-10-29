/**
 * Encryption of the saved API keys (AES-256-GCM, node:crypto only). Pure: the server key comes in as a
 * parameter, so it is unit tested. Format of a stored value: `v1.<keyId>.<iv>.<tag>.<ciphertext>`, all
 * base64url; `keyId` (first 4 bytes of SHA-256 of the key, hex) says which key encrypted it.
 * The authenticated data ties a value to its owner and provider: a row copied to another user or provider
 * does not decrypt (docs/platform/AUTH_MULTIUSER.md, section 5).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type DecryptResult =
  | {
      ok: true;
      plain: string;
      /** True when the value was stored in the old plain format or with an older key. */ stale: boolean;
    }
  | { ok: false; reason: "no matching key" | "corrupted" };

/** Decodes a base64 server key; null unless it is exactly 32 bytes. */
export function parseEncryptionKey(value: string): Buffer | null {
  const key = Buffer.from(value.trim(), "base64");
  return key.length === KEY_BYTES ? key : null;
}

export function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${PREFIX}.`);
}

export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [PREFIX, keyId(key), iv, cipher.getAuthTag(), data].map((p) =>
    typeof p === "string" ? p : p.toString("base64url"),
  );
  return parts.join(".");
}

/**
 * Decrypts a stored value with the current key or, matching by `keyId`, one of the old ones. A value that
 * does not start with `v1.` is a key saved in plain text by an older version: accepted, flagged `stale`.
 * Never throws.
 */
export function decryptSecret(stored: string, keys: Buffer[], aad: string): DecryptResult {
  if (!isEncrypted(stored)) return { ok: true, plain: stored, stale: true };
  const [, id, iv, tag, data, ...extra] = stored.split(".");
  if (!id || !iv || !tag || data === undefined || extra.length > 0) return { ok: false, reason: "corrupted" };
  const index = keys.findIndex((key) => keyId(key) === id);
  if (index === -1) return { ok: false, reason: "no matching key" };
  try {
    const decipher = createDecipheriv("aes-256-gcm", keys[index], Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    return { ok: true, plain, stale: index !== 0 };
  } catch {
    return { ok: false, reason: "corrupted" };
  }
}
