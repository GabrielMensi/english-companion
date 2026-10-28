import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { makeTempDir, removeTempDir } from "@/test/temp-db";
import { getAuthSecret } from "./secret";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTempDir(dir);
});
function envIn(extra: Record<string, string> = {}) {
  const dir = makeTempDir("companion-secret-");
  dirs.push(dir);
  return { dir, env: parseEnv({ DATABASE_PATH: path.join(dir, "test.db"), ...extra }) };
}

describe("getAuthSecret", () => {
  it("uses BETTER_AUTH_SECRET when it is set, without writing any file", () => {
    const { dir, env } = envIn({ BETTER_AUTH_SECRET: "s".repeat(40) });
    expect(getAuthSecret(env)).toBe("s".repeat(40));
    expect(fs.existsSync(path.join(dir, "auth.secret"))).toBe(false);
  });

  it("locally, generates one next to the database, owner-only, and keeps it", () => {
    const { dir, env } = envIn();
    const first = getAuthSecret(env);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(fs.statSync(path.join(dir, "auth.secret")).mode & 0o777).toBe(0o600);
    expect(getAuthSecret(env)).toBe(first);
  });

  it("in a deploy, never invents one", () => {
    const { dir, env } = envIn({ ALLOWED_HOSTS: "companion.example.com" });
    expect(() => getAuthSecret(env)).toThrow(/BETTER_AUTH_SECRET is required/);
    expect(fs.existsSync(path.join(dir, "auth.secret"))).toBe(false);
  });
});
