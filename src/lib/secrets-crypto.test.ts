import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted, keyId, parseEncryptionKey } from "./secrets-crypto";

const key = randomBytes(32);
const other = randomBytes(32);
const AAD = "user-a:gemini";

describe("secrets-crypto", () => {
  it("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("AIzaSecret123", key, AAD);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("AIzaSecret123");
    expect(decryptSecret(stored, [key], AAD)).toEqual({ ok: true, plain: "AIzaSecret123", stale: false });
  });

  it("uses a new IV each time", () => {
    expect(encryptSecret("k", key, AAD)).not.toBe(encryptSecret("k", key, AAD));
  });

  it("fails for another owner or provider (authenticated data)", () => {
    const stored = encryptSecret("k", key, AAD);
    expect(decryptSecret(stored, [key], "user-b:gemini").ok).toBe(false);
    expect(decryptSecret(stored, [key], "user-a:groq").ok).toBe(false);
  });

  it("fails for a tampered value", () => {
    const parts = encryptSecret("k", key, AAD).split(".");
    parts[3] = randomBytes(16).toString("base64url");
    expect(decryptSecret(parts.join("."), [key], AAD)).toEqual({ ok: false, reason: "corrupted" });
    expect(decryptSecret("v1.garbage", [key], AAD).ok).toBe(false);
  });

  it("fails with the wrong key", () => {
    expect(decryptSecret(encryptSecret("k", key, AAD), [other], AAD)).toEqual({ ok: false, reason: "no matching key" });
  });

  it("decrypts with an old key and flags it stale", () => {
    const stored = encryptSecret("k", other, AAD);
    expect(decryptSecret(stored, [key, other], AAD)).toEqual({ ok: true, plain: "k", stale: true });
  });

  it("accepts the old plain format, flagged stale", () => {
    expect(decryptSecret("AIzaPlain", [key], AAD)).toEqual({ ok: true, plain: "AIzaPlain", stale: true });
  });

  it("never mistakes another version for a plain key, and refuses truncated tags", () => {
    expect(decryptSecret("v2.abc.def.ghi.jkl", [key], AAD)).toEqual({ ok: false, reason: "unsupported version" });
    const parts = encryptSecret("k", key, AAD).split(".");
    parts[3] = Buffer.from(parts[3], "base64url").subarray(0, 4).toString("base64url");
    expect(decryptSecret(parts.join("."), [key], AAD).ok).toBe(false);
  });

  it("parses only 32-byte base64 keys", () => {
    expect(parseEncryptionKey(key.toString("base64"))?.equals(key)).toBe(true);
    expect(parseEncryptionKey("c2hvcnQ=")).toBeNull();
    expect(keyId(key)).toHaveLength(8);
  });
});
