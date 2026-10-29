import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { makeTempDir, removeTempDir } from "@/test/temp-db";
import { getEncryptionKeys } from "./encryption-key";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTempDir(dir);
});
function envIn(extra: Record<string, string> = {}) {
  const dir = makeTempDir("companion-enckey-");
  dirs.push(dir);
  return { dir, env: parseEnv({ DATABASE_PATH: path.join(dir, "test.db"), ...extra }) };
}

describe("getEncryptionKeys", () => {
  it("uses APP_ENCRYPTION_KEY first, then the old ones, without writing a file", () => {
    const current = randomBytes(32);
    const old = randomBytes(32);
    const { dir, env } = envIn({
      APP_ENCRYPTION_KEY: current.toString("base64"),
      APP_ENCRYPTION_KEYS_OLD: old.toString("base64"),
    });
    const keys = getEncryptionKeys(env);
    expect(keys[0].equals(current)).toBe(true);
    expect(keys[1].equals(old)).toBe(true);
    expect(fs.existsSync(path.join(dir, "encryption.key"))).toBe(false);
  });

  it("locally, generates one next to the database, owner-only, and keeps it", () => {
    const { dir, env } = envIn();
    const first = getEncryptionKeys(env)[0];
    expect(fs.statSync(path.join(dir, "encryption.key")).mode & 0o777).toBe(0o600);
    expect(Buffer.from(fs.readFileSync(path.join(dir, "encryption.key"), "utf8").trim(), "base64").equals(first)).toBe(
      true,
    );
    expect(fs.readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("in a deploy, never invents one", () => {
    const { dir, env } = envIn({ ALLOWED_HOSTS: "companion.example.com" });
    expect(() => getEncryptionKeys(env)).toThrow(/APP_ENCRYPTION_KEY is required/);
    expect(fs.existsSync(path.join(dir, "encryption.key"))).toBe(false);
  });

  it("never replaces a saved key that is unusable", () => {
    const { dir, env } = envIn();
    const file = path.join(dir, "encryption.key");
    fs.writeFileSync(file, "garbage");
    expect(() => getEncryptionKeys(env)).toThrow(/not a valid encryption key/);
    expect(fs.readFileSync(file, "utf8")).toBe("garbage");
  });
});
